import type { ClaudeAdapter } from "../claude/adapter.js";
import { db } from "../db/client.js";
import { recentConversations } from "../db/conversations.js";
import { upsertDailySummary } from "../db/dailySummary.js";
import {
  insertObservation,
  fetchActiveProfile,
  type ProfileKind,
  type ProfileRow,
} from "../db/userProfile.js";
import { consolidateNewObservation } from "../profile/consolidate.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

export type DataSnapshot = {
  conversationsByRole: { user: number; bot: number };
  conversationLines: string[];
  budgetLines: string[];   // "외식 7000원 김밥"
  routineLines: string[];  // "운동 체크"
  memoLines: string[];     // 최근 메모 짧게
};

export async function gatherTodayData(today: string): Promise<DataSnapshot> {
  const conv = await recentConversations(24);
  const conversationLines = conv
    .slice()
    .reverse()
    .map((c) => `${c.role === "user" ? "다영" : c.role === "bot" ? "이지은" : "[s]"}: ${c.content}`);
  const conversationsByRole = {
    user: conv.filter((c) => c.role === "user").length,
    bot: conv.filter((c) => c.role === "bot").length,
  };

  // budget_entries: date is a date column, select by equality
  const { data: budget } = await db()
    .from("budget_entries")
    .select("category, description, amount")
    .eq("date", today);
  const budgetLines = (budget ?? []).map(
    (b) => `${b.category} ${(b.amount as number).toLocaleString()}원 ${b.description ?? ""}`.trim()
  );

  // routine_checks: date is a date column (no checked_at; use item_id not routine_id)
  const { data: routine } = await db()
    .from("routine_checks")
    .select("item_id, date")
    .eq("date", today);
  const routineLines = (routine ?? []).map((r) => `루틴 체크 ${r.item_id}`);

  // memo_entries: created_at is timestamptz, filter by KST day range
  const since = `${today}T00:00:00+09:00`;
  const until = `${today}T23:59:59+09:00`;
  const { data: memo } = await db()
    .from("memo_entries")
    .select("content, created_at")
    .gte("created_at", since)
    .lte("created_at", until);
  const memoLines = (memo ?? []).map((m) => `메모: ${(m.content as string)?.slice(0, 60) ?? ""}`);

  return { conversationsByRole, conversationLines, budgetLines, routineLines, memoLines };
}

export function buildDataBriefing(snap: DataSnapshot): string {
  return [
    `대화 (${snap.conversationsByRole.user} 다영 / ${snap.conversationsByRole.bot} 이지은):`,
    snap.conversationLines.length > 0 ? snap.conversationLines.join("\n") : "(없음)",
    "",
    `가계부 ${snap.budgetLines.length}건:`,
    snap.budgetLines.length > 0 ? snap.budgetLines.map((l) => `- ${l}`).join("\n") : "(없음)",
    "",
    `루틴 ${snap.routineLines.length}건:`,
    snap.routineLines.length > 0 ? snap.routineLines.join("\n") : "(없음)",
    "",
    `메모 ${snap.memoLines.length}건:`,
    snap.memoLines.length > 0 ? snap.memoLines.join("\n") : "(없음)",
  ].join("\n");
}

const SUMMARY_SYSTEM_PROMPT = `
너는 다영의 친구 이지은의 *기록 모드*다. 그날 데이터를 1~3문장 관찰로 요약하고,
새로 알게 된 *사실*만 user_profile observation 후보로 추출해.

출력은 JSON only:
{
  "summary": "오늘 1~3문장. 관찰만. 평가/판단 X.",
  "new_observations": [
    {"kind": "pattern" | "preference" | "tone", "observation": "한 줄", "evidence_dates": ["YYYY-MM-DD"]}
  ]
}

룰:
- "다영은 게으르다" 같은 평가 X. "운동 루틴 미루는 빈도가 늘었다" O.
- 기존 활성 프로필에 이미 비슷한 게 있으면 추출 X (다음 단계 consolidate가 처리하니 중복 줄여)
- 새 관찰 없으면 new_observations: []
- 데이터가 거의 없는 날은 summary 한 문장으로 짧게 ("오늘은 외식 1회, 메모 없음.")
`.trim();

type ClaudeJsonOut = {
  summary: string;
  new_observations: Array<{
    kind: ProfileKind;
    observation: string;
    evidence_dates: string[];
  }>;
};

function parseClaudeJson(text: string): ClaudeJsonOut | null {
  const m = text.trim().match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]);
    if (typeof parsed.summary !== "string") return null;
    if (!Array.isArray(parsed.new_observations)) return null;
    return parsed as ClaudeJsonOut;
  } catch {
    return null;
  }
}

export function buildFallbackSummary(snap: DataSnapshot): string {
  const parts: string[] = [];
  if (snap.budgetLines.length > 0) parts.push(`외식·소비 ${snap.budgetLines.length}건`);
  if (snap.routineLines.length > 0) parts.push(`루틴 ${snap.routineLines.length}건`);
  if (snap.memoLines.length > 0) parts.push(`메모 ${snap.memoLines.length}건`);
  if (snap.conversationsByRole.user > 0)
    parts.push(`대화 ${snap.conversationsByRole.user + snap.conversationsByRole.bot}회`);
  return parts.length > 0 ? parts.join(", ") + "." : "특이사항 없음.";
}

/**
 * 매일 23:30 호출. 그날 데이터를 모아 Claude에게 요약 + 신규 관찰 추출 요청.
 * JSON 파싱 실패 또는 Claude 실패 시 데이터 기반 fallback summary로 대체.
 *
 * 신규 observation은 INSERT 후 consolidate로 통합.
 */
export async function runDailySummary(claude: ClaudeAdapter, today: string): Promise<void> {
  const snap = await gatherTodayData(today);
  const briefing = buildDataBriefing(snap);
  const active = await fetchActiveProfile(30);
  const profileBlock = active.length > 0
    ? active.map((p) => `- (${p.kind}) ${p.observation}`).join("\n")
    : "(아직 없음)";

  const userPrompt = [
    `오늘 = ${today}`,
    "",
    "[활성 프로필 — 중복 추출 피하라]",
    profileBlock,
    "",
    "[그날 데이터]",
    briefing,
    "",
    "JSON으로 출력:",
  ].join("\n");

  let parsed: ClaudeJsonOut | null = null;
  try {
    const result = await claude.ask({
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      userPrompt,
    });
    parsed = parseClaudeJson(result.text);
    if (!parsed) {
      logger.warn("dailySummary: JSON parse failed, using fallback", {
        excerpt: result.text.slice(0, 120),
      });
    }
  } catch (err) {
    logger.error("dailySummary: Claude call failed, using fallback", { err: String(err) });
  }

  const summary = parsed?.summary ?? buildFallbackSummary(snap);
  await upsertDailySummary(today, summary);
  logger.info("dailySummary: saved", { date: today, summaryLen: summary.length });

  if (!parsed || parsed.new_observations.length === 0) return;

  for (const obs of parsed.new_observations) {
    if (!obs.observation || !obs.kind) continue;
    const newId = await insertObservation({
      kind: obs.kind,
      observation: obs.observation,
      evidence_dates: obs.evidence_dates?.length ? obs.evidence_dates : [today],
    });
    // re-fetch active (방금 INSERT 이전 시점)으로 비교
    const activeForCompare = active.filter((a) => a.id !== newId);
    const newRow: ProfileRow = {
      id: newId,
      kind: obs.kind,
      observation: obs.observation,
      evidence_dates: obs.evidence_dates ?? [today],
      superseded_by: null,
      created_at: "",
      updated_at: "",
    };
    try {
      await consolidateNewObservation(claude, newRow, activeForCompare, today);
    } catch (err) {
      logger.warn("consolidate failed, leaving raw", { newId, err: String(err) });
    }
  }
}
