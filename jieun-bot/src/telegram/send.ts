import { bot, ownerChatId } from "./bot.js";
import { saveConversation, type Trigger } from "../db/conversations.js";

const SPLIT_RE = /\n{2,}/;
const INTER_CHUNK_DELAY_MS = 800;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Send text to the owner. If the text contains paragraph breaks (one or more
 * blank lines), split into separate Telegram messages — like a person texting
 * 2~3 short bubbles instead of one wall of text. Each chunk is saved to
 * bot_conversations as its own row, matching the visible chat order.
 *
 * Inter-chunk: brief "typing..." indicator + ~800ms pause for natural rhythm.
 */
export async function sendToOwner(text: string, trigger: Trigger): Promise<void> {
  const chunks = text.split(SPLIT_RE).map((c) => c.trim()).filter(Boolean);
  if (chunks.length === 0) return;

  let isFirst = true;
  for (const chunk of chunks) {
    if (!isFirst) {
      await bot().api.sendChatAction(ownerChatId(), "typing");
      await sleep(INTER_CHUNK_DELAY_MS);
    }
    await bot().api.sendMessage(ownerChatId(), chunk);
    await saveConversation("bot", chunk, trigger);
    isFirst = false;
  }
}
