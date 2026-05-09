import { describe, it, expect, afterAll } from "vitest";
import { db } from "../db/client.js";
import { fetchDailySummariesBetween } from "../db/dailySummary.js";
import {
  buildDataBriefing,
  buildFallbackSummary,
  runDailySummary,
} from "./dailySummary.js";
import type { ClaudeAdapter, ClaudeCallInput, ClaudeCallResult } from "../claude/adapter.js";

class MockClaude implements ClaudeAdapter {
  constructor(public response: string) {}
  async ask(_: ClaudeCallInput): Promise<ClaudeCallResult> {
    return { text: this.response, durationMs: 0 };
  }
}

class FailingClaude implements ClaudeAdapter {
  async ask(_: ClaudeCallInput): Promise<ClaudeCallResult> {
    throw new Error("simulated failure");
  }
}

const TEST_DATE = "2024-02-29"; // unique fixed date
const TEST_PREFIX = "__test_dsj_";

describe("buildDataBriefing", () => {
  it("renders empty sections with (없음)", () => {
    const briefing = buildDataBriefing({
      conversationsByRole: { user: 0, bot: 0 },
      conversationLines: [],
      budgetLines: [],
      routineLines: [],
      memoLines: [],
    });
    expect(briefing).toContain("(없음)");
  });

  it("renders all sections when present", () => {
    const briefing = buildDataBriefing({
      conversationsByRole: { user: 2, bot: 1 },
      conversationLines: ["다영: hi", "이지은: hey", "다영: bye"],
      budgetLines: ["식사 7000원 김밥"],
      routineLines: ["루틴 체크 morning_walk"],
      memoLines: ["메모: 점심 잘"],
    });
    expect(briefing).toContain("식사 7000원 김밥");
    expect(briefing).toContain("루틴 체크 morning_walk");
  });
});

describe("buildFallbackSummary", () => {
  it("empty snap → 특이사항 없음", () => {
    const out = buildFallbackSummary({
      conversationsByRole: { user: 0, bot: 0 },
      conversationLines: [],
      budgetLines: [],
      routineLines: [],
      memoLines: [],
    });
    expect(out).toBe("특이사항 없음.");
  });

  it("populated → comma joined parts", () => {
    const out = buildFallbackSummary({
      conversationsByRole: { user: 1, bot: 1 },
      conversationLines: [],
      budgetLines: ["식사"],
      routineLines: ["루틴"],
      memoLines: [],
    });
    expect(out).toContain("외식·소비 1건");
    expect(out).toContain("루틴 1건");
  });
});

describe("runDailySummary integration (mock Claude)", () => {
  afterAll(async () => {
    await db().from("daily_summary").delete().eq("date", TEST_DATE);
    await db().from("user_profile").delete().like("observation", `${TEST_PREFIX}%`);
  });

  it("saves summary and inserts observations on valid JSON", async () => {
    const claude = new MockClaude(JSON.stringify({
      summary: `${TEST_PREFIX}오늘 외식 1회.`,
      new_observations: [
        {
          kind: "preference",
          observation: `${TEST_PREFIX}김밥 좋아함`,
          evidence_dates: [TEST_DATE],
        },
      ],
    }));

    await runDailySummary(claude, TEST_DATE);
    const rows = await fetchDailySummariesBetween(TEST_DATE, TEST_DATE);
    expect(rows.find((r) => r.summary === `${TEST_PREFIX}오늘 외식 1회.`)).toBeDefined();

    const { data: profile } = await db()
      .from("user_profile")
      .select("observation")
      .like("observation", `${TEST_PREFIX}%`);
    expect(profile?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("falls back to data-based summary when JSON parse fails", async () => {
    await db().from("daily_summary").delete().eq("date", TEST_DATE);
    const claude = new MockClaude("not json at all");
    await runDailySummary(claude, TEST_DATE);
    const rows = await fetchDailySummariesBetween(TEST_DATE, TEST_DATE);
    expect(rows.length).toBe(1);
    // fallback is built from data — just verify some non-empty text
    expect(rows[0]!.summary.length).toBeGreaterThan(0);
  });

  it("falls back when Claude throws", async () => {
    await db().from("daily_summary").delete().eq("date", TEST_DATE);
    await runDailySummary(new FailingClaude(), TEST_DATE);
    const rows = await fetchDailySummariesBetween(TEST_DATE, TEST_DATE);
    expect(rows.length).toBe(1);
  });
});
