import { bot, ownerChatId } from "./bot.js";
import { saveConversation, type Trigger } from "../db/conversations.js";

export async function sendToOwner(text: string, trigger: Trigger): Promise<void> {
  await bot().api.sendMessage(ownerChatId(), text);
  await saveConversation("bot", text, trigger);
}
