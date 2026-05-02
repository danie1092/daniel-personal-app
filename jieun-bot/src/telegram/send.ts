import { bot, ownerChatId } from "./bot.js";
import { saveConversation, type Trigger } from "../db/conversations.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

const SPLIT_RE = /\n{2,}/;

// chunk 수 hard cap. prompt 룰만으론 Claude의 "공감 chunk + 질문 chunk" 분리 충동이
// 안 잡혀서 코드에서 강제 차단. 라이브 검증 6+ 회 모두 "응 ㅋㅋ" 같은 짧은 답에도
// 2 chunks 보내는 패턴 일관됨 → prompt-level 해결 한계 인정하고 deterministic cap.
//
// 트리거별 cap (일단 단순화):
// - 모두 1 chunk. 추가 chunk는 drop 후 로그.
// - 깊은 대화 필요 (retro 23:00 등)가 cramp되면 그때 트리거별 분기 추가.
const MAX_CHUNKS_PER_TURN: Record<Trigger, number> = {
  user: 1,
  schedule: 1,
  event: 1,
  latent: 1,
  system: 1,
};

// 사람이 카톡 칠 때 호흡 — 길이 비례. 길수록 "타이핑 시간" 늘어나는 느낌.
const BASELINE_DELAY_MS = 600;
const PER_CHAR_MS = 40;       // ~25 char/s = 적당한 모바일 타이핑 속도
const MAX_DELAY_MS = 4500;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function typingDelayFor(text: string): number {
  return Math.min(BASELINE_DELAY_MS + text.length * PER_CHAR_MS, MAX_DELAY_MS);
}

/**
 * Send text to the owner. If the text contains paragraph breaks (one or more
 * blank lines), split into separate Telegram messages — like a person texting
 * a few short bubbles instead of one wall of text. Each chunk is saved to
 * bot_conversations as its own row, matching the visible chat order.
 *
 * Trigger-specific MAX_CHUNKS_PER_TURN cap drops chunks beyond limit and logs
 * the dropped content (so we can see what Claude tried to add).
 *
 * Inter-chunk delay is *length-proportional* (≈600ms baseline + 40ms/char,
 * capped at 4.5s) so a longer next message simulates a longer typing time.
 * "typing..." indicator is shown during the delay.
 */
export async function sendToOwner(text: string, trigger: Trigger): Promise<void> {
  const allChunks = text.split(SPLIT_RE).map((c) => c.trim()).filter(Boolean);
  if (allChunks.length === 0) return;

  const cap = MAX_CHUNKS_PER_TURN[trigger];
  const chunks = allChunks.slice(0, cap);
  if (allChunks.length > cap) {
    logger.info("chunks capped", {
      trigger,
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
