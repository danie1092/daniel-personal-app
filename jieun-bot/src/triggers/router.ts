import type { Trigger } from "../db/conversations.js";
import type { ClaudeAdapter } from "../claude/adapter.js";
import { buildSystemPrompt } from "../persona/prompt.js";
import { sendToOwner } from "../telegram/send.js";
import type { ScheduleKind } from "../telegram/send.js";
import { loadMemorySection, getProfileSection } from "../memory/load.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";
import { parseActions } from "../claude/actions.js";
import { executeActions } from "../claude/executeActions.js";
import { isInSilenceWindow } from "./silenceWindow.js";
import { markFired } from "../db/botSignals.js";
import { isMuted } from "../db/botMute.js";
import { shouldBackoff } from "./backoff.js";
import { getPending } from "../calendar/pending.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

export type TriggerContext = {
  trigger: Exclude<Trigger, "system">;
  scheduleKind?: ScheduleKind;  // schedule 트리거에서만 의미 있음
  userPrompt: string;          // 트리거의 질문 / 다영 메시지 / 컨텍스트
  contextSection?: string;     // 시그널 후보 등 (Block 3에서 채움)
  signalCandidateIds?: string[]; // event 트리거에서 발화 성공 시 mark 대상
  chatId: number;              // 캘린더 pending Map key (per-user). 보통 OWNER chat id.
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
  // user 트리거는 항상 살림 (다영이 새벽에 메시지 보내면 응답)
  // schedule/event/latent는 뮤트/backoff/자정~07:59 차단
  if (ctx.trigger !== "user") {
    if (await isMuted()) {
      logger.info("silenced (mute)", { trigger: ctx.trigger });
      return "";
    }
    if (await shouldBackoff()) {
      logger.info("silenced (backoff)", { trigger: ctx.trigger });
      return "";
    }
  }
  if (ctx.trigger !== "user" && isInSilenceWindow()) {
    logger.info("silenced (window)", { trigger: ctx.trigger });
    return "";
  }

  const memorySection = await loadMemorySection(24);
  const profileSection = await getProfileSection(30);

  // pending hint 주입 — user 트리거 only. Claude가 다영의 응답을
  // confirm/cancel/수정 중 어느 쪽인지 판단할 컨텍스트 제공.
  let pendingHint = "";
  if (ctx.trigger === "user") {
    const p = getPending(ctx.chatId);
    if (p) {
      if (p.kind === "register") {
        pendingHint = `[지금 pending — 등록 제안]\n${p.title} ${p.start} ~ ${p.end}\n다영의 응답이 confirm/cancel/수정인지 잘 보고 액션 emit.`;
      } else {
        pendingHint = `[지금 pending — 삭제 제안]\n${p.display} (uid=${p.targetUid})\n다영의 응답이 confirm/cancel인지 잘 보고 액션 emit.`;
      }
    }
  }

  const combinedContext = [pendingHint, ctx.contextSection ?? ""]
    .filter(Boolean)
    .join("\n\n");

  const systemPrompt = buildSystemPrompt({
    trigger: ctx.trigger,
    scheduleKind: ctx.scheduleKind,
    now: new Date(),
    memorySection,
    profileSection,
    contextSection: combinedContext,
  });

  try {
    const result = await claude.ask({ systemPrompt, userPrompt: ctx.userPrompt });
    const { cleanText, actions, parseError } = parseActions(result.text);
    if (parseError) {
      logger.warn("actions parse error", { trigger: ctx.trigger, parseError });
    }
    if (cleanText) {
      await sendToOwner(cleanText, ctx.trigger, ctx.scheduleKind);
      if (ctx.signalCandidateIds?.length) {
        for (const id of ctx.signalCandidateIds) {
          try {
            await markFired(id, cleanText);
          } catch (err) {
            logger.warn("markFired failed", { id, err: String(err) });
          }
        }
      }
    }
    if (actions.length > 0) {
      await executeActions(actions, ctx.chatId);
      logger.info("actions executed", { trigger: ctx.trigger, count: actions.length });
    }
    logger.info("trigger ran", {
      trigger: ctx.trigger,
      durationMs: result.durationMs,
      hadText: !!cleanText,
      actionCount: actions.length,
    });
    return cleanText;
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
