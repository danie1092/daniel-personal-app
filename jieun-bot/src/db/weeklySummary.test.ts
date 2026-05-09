import { describe, it, expect, afterAll } from "vitest";
import { db } from "./client.js";
import { upsertWeeklySummary, fetchWeeklySummariesBetween } from "./weeklySummary.js";

const TEST_PREFIX = "__test_wsum_";

describe("weeklySummary CRUD", () => {
  afterAll(async () => {
    await db().from("weekly_summary").delete().like("summary", `${TEST_PREFIX}%`);
  });

  it("upsert inserts then updates", async () => {
    const week = "2024-01-07"; // some sunday
    await upsertWeeklySummary(week, `${TEST_PREFIX}first`);
    await upsertWeeklySummary(week, `${TEST_PREFIX}second`);
    const rows = await fetchWeeklySummariesBetween("2024-01-01", "2024-01-31");
    const ours = rows.filter((r) => r.summary.startsWith(TEST_PREFIX));
    expect(ours).toHaveLength(1);
    expect(ours[0]!.summary).toBe(`${TEST_PREFIX}second`);
  });

  it("fetchWeeklySummariesBetween returns chronological", async () => {
    await upsertWeeklySummary("2024-02-04", `${TEST_PREFIX}a`);
    await upsertWeeklySummary("2024-01-21", `${TEST_PREFIX}b`);
    const rows = await fetchWeeklySummariesBetween("2024-01-15", "2024-02-10");
    const ours = rows.filter((r) => r.summary.startsWith(TEST_PREFIX));
    expect(ours.map((r) => r.week_start)).toEqual(["2024-01-21", "2024-02-04"]);
  });
});
