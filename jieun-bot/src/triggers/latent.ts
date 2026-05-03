import type { ClaudeAdapter } from "../claude/adapter.js";
import { computeSignals } from "../signals/compute.js";
import { recordCandidate, markFired } from "../db/botSignals.js";
import { loadMemorySection, getProfileSection } from "../memory/load.js";
import { buildSystemPrompt } from "../persona/prompt.js";
import { sendToOwner } from "../telegram/send.js";
import { isInSilenceWindow } from "./silenceWindow.js";
import { latentSnapshot } from "../calendar/context.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

const LATENT_SYSTEM_DIRECTIVE = `
[잠재 관찰 모드]
6시간마다 깨어서 다영에게 *지금* 말 거는 것이 자연스러운지 판단해.
침묵이 기본. 어색하면 침묵. 도배되면 침묵. 별일 없으면 침묵.

발화 가치 기준:
- 시그널의 evidence가 *지금* 다영의 관심사일 때 (예: 카테고리 이상치가 어제오늘 발생)
- profile/memory에서 *연결*이 보일 때 ("지난주 외식 많았는데 이번 주는...")
- 일상 흐름에 *진심으로* 끼어들고 싶을 때

발화 자제:
- 다영이 자정~07:59 어딘가 자고 있을 시간 (silence window 코드가 막지만 prompt 차원에서도 인식)
- 같은 종류 시그널이 24h 안에 이미 발화됨
- 그저 "안부" 정도 — 다른 schedule 트리거가 채움
- 발화율 70%+ 침묵 목표

JSON only:
{
  "speak": boolean,
  "reason": "왜 결정했는지 1문장",
  "message": "speak=true 시에만, 한 chunk 짧게 (3-4문장)"
}
`.trim();

type LatentDecision = {
  speak: boolean;
  reason: string;
  message?: string;
};

function parseLatentDecision(text: string): LatentDecision | null {
  const m = text.trim().match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]);
    if (typeof parsed.speak !== "boolean") return null;
    if (typeof parsed.reason !== "string") return null;
    return parsed as LatentDecision;
  } catch {
    return null;
  }
}

function evidenceToContext(candidates: Awaited<ReturnType<typeof computeSignals>>): string {
  const lines: string[] = [];
  for (const c of candidates) {
    const e = c.evidence as Record<string, unknown>;
    lines.push(`- ${c.kind}: ${JSON.stringify(e)}`);
  }
  return lines.join("\n");
}

/**
 * 잠재 관찰 트리거 진입. silence window면 즉시 종료.
 * Claude → JSON 파싱 → speak=true면 send + bot_conversations row + markFired.
 * speak=false면 로그만 + 시그널 dedup row는 만들되 fired_at NULL 유지.
 */
export async function runLatentObservation(claude: ClaudeAdapter): Promise<void> {
  if (isInSilenceWindow()) {
    logger.info("latent: silence window, skip");
    return;
  }

  let candidates: Awaited<ReturnType<typeof computeSignals>>;
  try {
    candidates = await computeSignals();
  } catch (err) {
    logger.warn("latent: computeSignals failed", { err: String(err) });
    return;
  }

  const candidateIds: string[] = [];
  for (const c of candidates) {
    try {
      candidateIds.push(await recordCandidate({ kind: c.kind, evidence: c.evidence }));
    } catch (err) {
      logger.warn("latent: recordCandidate failed", { kind: c.kind, err: String(err) });
    }
  }

  const memorySection = await loadMemorySection(24);
  const profileSection = await getProfileSection(30);
  const signalsBlock = candidates.length > 0 ? evidenceToContext(candidates) : "(시그널 없음)";

  let calendarHint = "";
  try {
    calendarHint = await latentSnapshot(new Date());
  } catch (err) {
    logger.warn("latent calendar snapshot failed", { err: String(err) });
  }

  const contextSection = [`[활성 시그널]\n${signalsBlock}`, calendarHint]
    .filter((s) => s && s.length > 0)
    .join("\n\n");

  const systemPrompt = buildSystemPrompt({
    trigger: "latent",
    now: new Date(),
    memorySection,
    profileSection,
    contextSection,
  });

  const userPrompt = `${LATENT_SYSTEM_DIRECTIVE}\n\n위 컨텍스트로 JSON 출력:`;

  let decision: LatentDecision | null = null;
  try {
    const result = await claude.ask({ systemPrompt, userPrompt });
    decision = parseLatentDecision(result.text);
    if (!decision) {
      logger.warn("latent: JSON parse failed, treating as silent", {
        excerpt: result.text.slice(0, 120),
      });
      return;
    }
  } catch (err) {
    logger.error("latent: Claude failed, silent skip", { err: String(err) });
    return;
  }

  logger.info("latent: decision", { speak: decision.speak, reason: decision.reason });

  if (!decision.speak || !decision.message) {
    return;
  }

  await sendToOwner(decision.message, "latent");
  // sendToOwner가 saveConversation도 부르므로 별도 INSERT 불필요
  for (const id of candidateIds) {
    try {
      await markFired(id, decision.message);
    } catch (err) {
      logger.warn("latent: markFired failed", { id, err: String(err) });
    }
  }
}
