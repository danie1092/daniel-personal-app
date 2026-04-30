import { bot, ownerChatId } from "./bot.js";
import { saveConversation, type Trigger } from "../db/conversations.js";

const SPLIT_RE = /\n{2,}/;

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
 * Inter-chunk delay is *length-proportional* (≈600ms baseline + 40ms/char,
 * capped at 4.5s) so a longer next message simulates a longer typing time.
 * "typing..." indicator is shown during the delay.
 */
export async function sendToOwner(text: string, trigger: Trigger): Promise<void> {
  const chunks = text.split(SPLIT_RE).map((c) => c.trim()).filter(Boolean);
  if (chunks.length === 0) return;

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
