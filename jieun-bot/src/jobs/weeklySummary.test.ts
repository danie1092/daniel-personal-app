// jieun-bot/src/jobs/weeklySummary.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { db } from "../db/client.js";
import { upsertDailySummary } from "../db/dailySummary.js";
import { fetchWeeklySummariesBetween } from "../db/weeklySummary.js";
import { runWeeklySummary } from "./weeklySummary.js";
import type { ClaudeAdapter, ClaudeCallInput, ClaudeCallResult } from "../claude/adapter.js";

class MockClaude implements ClaudeAdapter {
  constructor(public response: string) {}
  async ask(_: ClaudeCallInput): Promise<ClaudeCallResult> {
    return { text: this.response, durationMs: 0 };
  }
}

const TEST_PREFIX = "__test_wsj_";
const WEEK_START = "2024-01-07"; // Sunday

describe("runWeeklySummary", () => {
  afterAll(async () => {
    await db().from("weekly_summary").delete().eq("week_start", WEEK_START);
    await db().from("daily_summary").delete().like("summary", `${TEST_PREFIX}%`);
  });

  it("aggregates daily summaries into a weekly row", async () => {
    // seed 7 dailies
    for (let i = 0; i < 7; i++) {
      const d = new Date(WEEK_START);
      d.setDate(d.getDate() + i);
      await upsertDailySummary(d.toISOString().slice(0, 10), `${TEST_PREFIX}day${i}`);
    }
    const claude = new MockClaude(`${TEST_PREFIX}weekly summary text`);
    await runWeeklySummary(claude, WEEK_START);
    const rows = await fetchWeeklySummariesBetween(WEEK_START, WEEK_START);
    expect(rows[0]!.summary).toBe(`${TEST_PREFIX}weekly summary text`);
  });

  it("skips when no dailies", async () => {
    await db().from("weekly_summary").delete().eq("week_start", "2025-12-28");
    const claude = new MockClaude("should not be saved");
    await runWeeklySummary(claude, "2025-12-28");
    const rows = await fetchWeeklySummariesBetween("2025-12-28", "2025-12-28");
    expect(rows).toHaveLength(0);
  });
});
