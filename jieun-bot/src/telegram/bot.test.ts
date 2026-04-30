import { describe, it, expect } from "vitest";
import { isOwnerChatId } from "./bot.js";

describe("isOwnerChatId", () => {
  it("accepts owner id", () => {
    process.env.TELEGRAM_OWNER_CHAT_ID = "12345";
    expect(isOwnerChatId(12345)).toBe(true);
  });
  it("rejects non-owner", () => {
    process.env.TELEGRAM_OWNER_CHAT_ID = "12345";
    expect(isOwnerChatId(99999)).toBe(false);
  });
});
