import type { Context } from "grammy";
import { bot, isOwnerChatId } from "./bot.js";
import { saveConversation } from "../db/conversations.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

export type MessageHandler = (text: string, ctx: Context) => Promise<void>;

export function attachReceive(handler: MessageHandler): void {
  bot().on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    if (!isOwnerChatId(chatId)) {
      logger.warn("non-owner message", { chatId, text: ctx.message.text.slice(0, 30) });
      return;
    }
    const text = ctx.message.text;
    await saveConversation("user", text, "user");
    try {
      await handler(text, ctx);
    } catch (err) {
      logger.error("handler error", { err: String(err) });
      await ctx.reply("(이지은이 잠깐 막혔어. 로그 확인 부탁해.)");
    }
  });
}
