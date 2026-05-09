import { Bot } from "grammy";
import { loadEnv } from "../env.js";

let cached: Bot | null = null;

export function bot(): Bot {
  if (cached) return cached;
  const env = loadEnv();
  cached = new Bot(env.TELEGRAM_BOT_TOKEN);
  return cached;
}

export function isOwnerChatId(chatId: number): boolean {
  const env = loadEnv();
  return chatId === env.TELEGRAM_OWNER_CHAT_ID;
}

export function ownerChatId(): number {
  return loadEnv().TELEGRAM_OWNER_CHAT_ID;
}
