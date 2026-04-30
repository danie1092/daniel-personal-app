import { describe, it, expect, afterAll } from "vitest";
import { db } from "./client.js";
import { saveConversation, recentConversations, type Trigger } from "./conversations.js";

const TEST_NS = "__test_conversations_";

describe("conversations", () => {
  afterAll(async () => {
    // 테스트로 추가한 row 정리
    await db().from("bot_conversations").delete().like("content", `${TEST_NS}%`);
  });

  it("saves and retrieves recent (24h)", async () => {
    await saveConversation("user", `${TEST_NS}hello`, "user");
    await saveConversation("bot", `${TEST_NS}world`, "user");
    const recent = await recentConversations(2);
    expect(recent.length).toBeGreaterThanOrEqual(2);
    const testRows = recent.filter((c) => c.content.startsWith(TEST_NS));
    expect(testRows.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects invalid trigger", async () => {
    await expect(
      saveConversation("user", `${TEST_NS}x`, "invalid" as Trigger)
    ).rejects.toThrow();
  });
});
