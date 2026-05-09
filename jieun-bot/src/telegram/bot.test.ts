import { describe, it, expect, afterEach } from "vitest";
import { isOwnerChatId } from "./bot.js";

const original = process.env.TELEGRAM_OWNER_CHAT_ID;

describe("isOwnerChatId", () => {
  afterEach(() => {
    if (original === undefined) delete process.env.TELEGRAM_OWNER_CHAT_ID;
    else process.env.TELEGRAM_OWNER_CHAT_ID = original;
  });

  it("accepts owner id", () => {
    process.env.TELEGRAM_OWNER_CHAT_ID = "12345";
    expect(isOwnerChatId(12345)).toBe(true);
  });
  it("rejects non-owner", () => {
    process.env.TELEGRAM_OWNER_CHAT_ID = "12345";
    expect(isOwnerChatId(99999)).toBe(false);
  });
});
