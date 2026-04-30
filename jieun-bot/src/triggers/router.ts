import type { Trigger } from "../db/conversations.js";
import type { ClaudeAdapter } from "../claude/adapter.js";
import { buildSystemPrompt } from "../persona/prompt.js";
import { sendToOwner } from "../telegram/send.js";
import { loadMemorySection } from "../memory/load.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

export type TriggerContext = {
  trigger: Exclude<Trigger, "system">;
  userPrompt: string;          // 트리거의 질문 / 다영 메시지 / 컨텍스트
  contextSection?: string;     // 시그널 후보 등 (Block 3에서 채움)
};

/**
 * 모든 트리거가 공유하는 흐름:
 * 1. 24h 메모리 로드
 * 2. 페르소나 시스템 프롬프트 합성
 * 3. Claude 호출
 * 4. 응답 텍스트 발신 (sendToOwner가 분리/저장 처리)
 *
 * 빈 응답이면 침묵 (발신 X). 에러면 user 트리거에 한해 폴백 메시지.
 */
export async function runTrigger(
  claude: ClaudeAdapter,
  ctx: TriggerContext
): Promise<string> {
  const memorySection = await loadMemorySection(24);
  const systemPrompt = buildSystemPrompt({
    trigger: ctx.trigger,
    now: new Date(),
    memorySection,
    profileSection: "",          // Block 4
    contextSection: ctx.contextSection ?? "",
  });

  try {
    const result = await claude.ask({ systemPrompt, userPrompt: ctx.userPrompt });
    if (result.text) {
      await sendToOwner(result.text, ctx.trigger);
    }
    logger.info("trigger ran", {
      trigger: ctx.trigger,
      durationMs: result.durationMs,
      hadText: !!result.text,
    });
    return result.text;
  } catch (err) {
    logger.error("trigger failed", { trigger: ctx.trigger, err: String(err) });
    if (ctx.trigger === "user") {
      await sendToOwner(
        "(이지은이 잠깐 막혔어. `claude login` 확인 부탁해.)",
        "system"
      );
    }
    return "";
  }
}
