import { describe, it, expect, afterAll } from "vitest";
import { db } from "./client.js";
import { recordCandidate, lastFiredAt, markFired } from "./botSignals.js";

const TEST_KIND = "category_outlier";
const TEST_PREFIX = "__test_botsig_";

describe("botSignals", () => {
  afterAll(async () => {
    // Clean up: delete any test rows. We mark with prefix in user_message.
    await db().from("bot_signals").delete().like("user_message", `${TEST_PREFIX}%`);
  });

  it("recordCandidate inserts and returns id", async () => {
    const id = await recordCandidate({ kind: TEST_KIND, evidence: { test: 1 } });
    expect(id).toMatch(/^[0-9a-f-]+$/);
  });

  it("markFired sets fired_at + user_message", async () => {
    const id = await recordCandidate({ kind: TEST_KIND, evidence: { test: 2 } });
    await markFired(id, `${TEST_PREFIX}hello`);
    const last = await lastFiredAt(TEST_KIND);
    expect(last).not.toBeNull();
    expect(last!.getTime()).toBeGreaterThan(Date.now() - 60 * 1000);
  });
});
