import type { ClaudeAdapter } from "../claude/adapter.js";
import {
  insertObservation,
  supersede,
  deleteObservation,
  type ProfileKind,
  type ProfileRow,
} from "../db/userProfile.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

const SIMILARITY_THRESHOLD = 0.5;

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .trim()
      .split(/\s+/)
      .filter(Boolean)
  );
}

export function jaccardSimilarity(a: string, b: string): number {
  const A = tokenize(a);
  const B = tokenize(b);
  if (A.size === 0 || B.size === 0) return 0;
  let intersection = 0;
  for (const t of A) if (B.has(t)) intersection++;
  const union = A.size + B.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function findConflictCandidates(
  newRow: ProfileRow,
  active: ProfileRow[],
  threshold: number = SIMILARITY_THRESHOLD
): ProfileRow[] {
  return active.filter(
    (a) =>
      a.id !== newRow.id &&
      a.kind === newRow.kind &&
      jaccardSimilarity(a.observation, newRow.observation) >= threshold
  );
}

export type MergeAction =
  | { action: "keep_old" }
  | { action: "replace" }
  | { action: "merge"; merged_text: string };

const MERGE_SYSTEM_PROMPT = `
다영의 활성 프로필 라인 1개와 신규 라인 1개를 받아 통합 결정을 내려.
출력은 JSON only:
{"action": "keep_old" | "replace" | "merge", "merged_text"?: string}

기준:
- keep_old = 신규가 기존보다 정확하지 않거나 같은 정보 반복일 때
- replace = 신규가 더 정확/구체적
- merge = 두 관찰을 합칠 때. merged_text는 한 줄로 (관찰만, 평가 X)

평가어 ("좋다", "나쁘다", "이상하다") 출력 X. 사실/관찰만.
`.trim();

export async function decideMerge(
  claude: ClaudeAdapter,
  oldObs: string,
  newObs: string
): Promise<MergeAction> {
  const result = await claude.ask({
    systemPrompt: MERGE_SYSTEM_PROMPT,
    userPrompt: `[기존]\n${oldObs}\n\n[신규]\n${newObs}\n\nJSON으로:`,
  });
  const trimmed = result.text.trim();
  // Claude가 ```json 코드블럭으로 감쌀 수 있으니 안쪽만 추출
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn("decideMerge: no JSON found, defaulting keep_old", { trimmed });
    return { action: "keep_old" };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as MergeAction;
    if (parsed.action !== "keep_old" && parsed.action !== "replace" && parsed.action !== "merge") {
      logger.warn("decideMerge: unknown action, defaulting keep_old", { action: (parsed as { action: unknown }).action });
      return { action: "keep_old" };
    }
    if (parsed.action === "merge" && !parsed.merged_text) {
      logger.warn("decideMerge: merge without merged_text, defaulting keep_old");
      return { action: "keep_old" };
    }
    return parsed;
  } catch (err) {
    logger.warn("decideMerge: JSON parse failed, defaulting keep_old", { err: String(err) });
    return { action: "keep_old" };
  }
}

/**
 * After inserting a new observation, find conflicts and apply merge logic.
 * - keep_old: delete the just-inserted new row (no change to active set)
 * - replace: supersede the old with the new (old.superseded_by = newId)
 * - merge: insert merged row, supersede both old AND just-inserted with merged
 */
export async function consolidateNewObservation(
  claude: ClaudeAdapter,
  newRow: ProfileRow,
  active: ProfileRow[],
  evidenceDate: string
): Promise<void> {
  const conflicts = findConflictCandidates(newRow, active);
  if (conflicts.length === 0) return;

  let replaced = false;

  for (const conflict of conflicts) {
    const decision = await decideMerge(claude, conflict.observation, newRow.observation);
    if (decision.action === "keep_old") {
      if (replaced) {
        logger.warn("consolidate: keep_old after prior replace — skipping delete to preserve replace", {
          oldId: conflict.id,
          newId: newRow.id,
        });
        return;
      }
      await deleteObservation(newRow.id);
      logger.info("consolidate: keep_old", { oldId: conflict.id, droppedNewId: newRow.id });
      return;
    }
    if (decision.action === "replace") {
      await supersede(conflict.id, newRow.id);
      replaced = true;
      logger.info("consolidate: replace", { oldId: conflict.id, newId: newRow.id });
      continue;
    }
    if (decision.action === "merge") {
      const mergedId = await insertObservation({
        kind: newRow.kind as ProfileKind,
        observation: decision.merged_text,
        evidence_dates: [...conflict.evidence_dates, evidenceDate],
      });
      await supersede(conflict.id, mergedId);
      await supersede(newRow.id, mergedId);
      logger.info("consolidate: merge", {
        oldId: conflict.id,
        newId: newRow.id,
        mergedId,
      });
      return;
    }
  }
}
