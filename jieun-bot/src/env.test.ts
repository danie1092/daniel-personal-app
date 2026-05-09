import { describe, it, expect, beforeEach } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  beforeEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_OWNER_CHAT_ID;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("throws when required vars missing", () => {
    expect(() => loadEnv()).toThrow(/TELEGRAM_BOT_TOKEN/);
  });

  it("returns parsed env when all set", () => {
    process.env.TELEGRAM_BOT_TOKEN = "abc:def";
    process.env.TELEGRAM_OWNER_CHAT_ID = "12345";
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sk_test";
    const env = loadEnv();
    expect(env.TELEGRAM_BOT_TOKEN).toBe("abc:def");
    expect(env.TELEGRAM_OWNER_CHAT_ID).toBe(12345);
    expect(env.SUPABASE_URL).toBe("https://x.supabase.co");
  });

  it("rejects non-numeric chat id", () => {
    process.env.TELEGRAM_BOT_TOKEN = "abc:def";
    process.env.TELEGRAM_OWNER_CHAT_ID = "not-a-number";
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sk_test";
    expect(() => loadEnv()).toThrow(/TELEGRAM_OWNER_CHAT_ID/);
  });
});
