import { bot, ownerChatId } from "./bot.js";
import { saveConversation, type Trigger } from "../db/conversations.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

const SPLIT_RE = /\n{2,}/;

// Schedule trigger의 sub-kind. "retro"만 chunk cap을 풀어줌 (3 chunks 허용 —
// 회고는 본질적으로 대화라 chunk 1로 압축하면 cramped됨). 그 외는 카톡 결
// 유지 (1 chunk).
//
// chunk 수 hard cap은 prompt 룰만으론 Claude의 "공감 chunk + 질문 chunk" 분리
// 충동이 안 잡혀서 코드에서 강제 차단. 라이브 검증 6+ 회 모두 "응 ㅋㅋ" 같은
// 짧은 답에도 2 chunks 보내는 패턴 일관됨 → prompt-level 해결 한계 인정하고
// deterministic cap. retro만 예외 (대화 본질상 호흡 필요).
export type ScheduleKind =
  | "morning"
  | "lunch"
  | "evening_brief"
  | "end_of_day"
  | "retro"
  | "daily_summary"   // 잡 — 발화 안 함 (cap 안 쓰임)
  | "weekly_summary"; // 잡 — 발화 안 함 (cap 안 쓰임)

export function getChunkCap(trigger: Trigger, scheduleKind?: ScheduleKind): number {
  if (trigger === "schedule" && scheduleKind === "retro") return 3;
  return 1;
}

// 사람이 카톡 칠 때 호흡 — 길이 비례. 길수록 "타이핑 시간" 늘어나는 느낌.
const BASELINE_DELAY_MS = 600;
const PER_CHAR_MS = 40;       // ~25 char/s = 적당한 모바일 타이핑 속도
const MAX_DELAY_MS = 4500;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function typingDelayFor(text: string): number {
  return Math.min(BASELINE_DELAY_MS + text.length * PER_CHAR_MS, MAX_DELAY_MS);
}

/**
 * Send text to the owner. Splits on blank-line paragraph breaks. Drops chunks
 * beyond `getChunkCap(trigger, scheduleKind)` and logs the dropped content.
 *
 * Inter-chunk delay is *length-proportional* (≈600ms baseline + 40ms/char,
 * capped at 4.5s) so a longer next message simulates a longer typing time.
 * "typing..." indicator is shown during the delay.
 */
export async function sendToOwner(
  text: string,
  trigger: Trigger,
  scheduleKind?: ScheduleKind
): Promise<void> {
  const allChunks = text.split(SPLIT_RE).map((c) => c.trim()).filter(Boolean);
  if (allChunks.length === 0) return;

  const cap = getChunkCap(trigger, scheduleKind);
  const chunks = allChunks.slice(0, cap);
  if (allChunks.length > cap) {
    logger.info("chunks capped", {
      trigger,
      scheduleKind,
      total: allChunks.length,
      kept: cap,
      dropped: allChunks.slice(cap).map((c) => c.slice(0, 80)),
    });
  }

  let isFirst = true;
  for (const chunk of chunks) {
    if (!isFirst) {
      await bot().api.sendChatAction(ownerChatId(), "typing");
      await sleep(typingDelayFor(chunk));
    }
    await bot().api.sendMessage(ownerChatId(), chunk);
    await saveConversation("bot", chunk, trigger);
    isFirst = false;
  }
}
