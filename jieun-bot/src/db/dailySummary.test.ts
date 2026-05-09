import { describe, it, expect, afterAll } from "vitest";
import { db } from "./client.js";
import { upsertDailySummary, fetchDailySummariesBetween } from "./dailySummary.js";

const TEST_PREFIX = "__test_dsum_";

describe("dailySummary CRUD", () => {
  afterAll(async () => {
    await db().from("daily_summary").delete().like("summary", `${TEST_PREFIX}%`);
  });

  it("upsertDailySummary inserts then updates", async () => {
    const date = "2024-01-01";
    await upsertDailySummary(date, `${TEST_PREFIX}first`);
    await upsertDailySummary(date, `${TEST_PREFIX}second`);
    const rows = await fetchDailySummariesBetween("2023-12-31", "2024-01-02");
    const ours = rows.filter((r) => r.summary.startsWith(TEST_PREFIX));
    expect(ours).toHaveLength(1);
    expect(ours[0]!.summary).toBe(`${TEST_PREFIX}second`);
  });

  it("fetchDailySummariesBetween returns chronological", async () => {
    await upsertDailySummary("2024-01-05", `${TEST_PREFIX}a`);
    await upsertDailySummary("2024-01-03", `${TEST_PREFIX}b`);
    await upsertDailySummary("2024-01-04", `${TEST_PREFIX}c`);
    const rows = await fetchDailySummariesBetween("2024-01-03", "2024-01-05");
    const ours = rows.filter((r) => r.summary.startsWith(TEST_PREFIX));
    expect(ours.map((r) => r.date)).toEqual(["2024-01-03", "2024-01-04", "2024-01-05"]);
  });
});
