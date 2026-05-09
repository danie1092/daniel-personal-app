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

    // 대화 raw 저장은 best-effort — 실패해도 응답 흐름은 막지 않음
    try {
      await saveConversation("user", text, "user");
    } catch (dbErr) {
      logger.error("saveConversation failed", { err: String(dbErr) });
    }

    try {
      await handler(text, ctx);
    } catch (err) {
      logger.error("handler error", { err: String(err) });
      try {
        await ctx.reply("(이지은이 잠깐 막혔어. 로그 확인 부탁해.)");
      } catch (replyErr) {
        logger.error("reply-after-error failed", { err: String(replyErr) });
      }
    }
  });
}
