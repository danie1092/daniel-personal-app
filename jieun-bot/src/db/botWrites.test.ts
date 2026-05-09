import { describe, it, expect, afterAll } from "vitest";
import { db } from "./client.js";
import { recordBotWrite, recentBotWrites, markBotWriteEdited } from "./botWrites.js";

const TEST_NOTE = "__test_botwrites_";

describe("botWrites", () => {
  afterAll(async () => {
    await db().from("bot_writes").delete().like("notes", `${TEST_NOTE}%`);
  });

  it("records and reads recent", async () => {
    const id = await recordBotWrite({
      targetTable: "budget_entries",
      targetId: "00000000-0000-0000-0000-000000000001",
      notes: `${TEST_NOTE}hello`,
    });
    expect(id).toMatch(/^[0-9a-f-]+$/);
    const recent = await recentBotWrites(1);
    const own = recent.filter((w) => w.notes?.startsWith(TEST_NOTE));
    expect(own.length).toBeGreaterThanOrEqual(1);
  });

  it("marks edited", async () => {
    const id = await recordBotWrite({
      targetTable: "budget_entries",
      targetId: "00000000-0000-0000-0000-000000000002",
      notes: `${TEST_NOTE}edit`,
    });
    await markBotWriteEdited(id);
    const recent = await recentBotWrites(1);
    const found = recent.find((w) => w.id === id);
    expect(found?.user_edited_at).not.toBeNull();
  });
});
