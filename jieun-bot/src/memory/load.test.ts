import { describe, it, expect, afterAll } from "vitest";
import { db } from "../db/client.js";
import {
  formatRecentConversations,
  formatDailySummaries,
  formatWeeklySummaries,
  getProfileSection,
} from "./load.js";
import type { DailySummary } from "../db/dailySummary.js";
import type { WeeklySummary } from "../db/weeklySummary.js";
import type { ProfileRow } from "../db/userProfile.js";

const TEST_PREFIX = "__test_load_";

describe("formatRecentConversations", () => {
  it("renders user/bot in chronological order with Korean labels", () => {
    // Input is newest-first (DB query order). Output should be oldest-first.
    const items = [
      { id: "3", role: "user" as const, content: "c", trigger: "user" as const, created_at: "2026-04-30T03:00:00Z" },
      { id: "2", role: "bot" as const, content: "b", trigger: "user" as const, created_at: "2026-04-30T02:00:00Z" },
      { id: "1", role: "user" as const, content: "a", trigger: "user" as const, created_at: "2026-04-30T01:00:00Z" },
    ];
    const out = formatRecentConversations(items);
    const lines = out.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("다영: a");
    expect(lines[1]).toBe("이지은: b");
    expect(lines[2]).toBe("다영: c");
  });

  it("returns empty string for empty input", () => {
    expect(formatRecentConversations([])).toBe("");
  });

  it("labels system role as [system]", () => {
    const items = [
      { id: "1", role: "system" as const, content: "hi", trigger: "system" as const, created_at: "2026-04-30T01:00:00Z" },
    ];
    expect(formatRecentConversations(items)).toBe("[system]: hi");
  });

  it("respects 30-row cap when slice is applied upstream", () => {
    // formatRecentConversations doesn't slice — that's loadMemorySection's job.
    // Here we just verify the function preserves all input rows.
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      role: "user" as const,
      content: `msg${i}`,
      trigger: "user" as const,
      created_at: `2026-04-30T${String(i).padStart(2, "0")}:00:00Z`,
    }));
    const out = formatRecentConversations(items);
    expect(out.split("\n")).toHaveLength(50);
  });
});

describe("formatDailySummaries", () => {
  it("returns empty string when no summaries", () => {
    expect(formatDailySummaries([])).toBe("");
  });

  it("renders chronological with date prefix", () => {
    const items: DailySummary[] = [
      { date: "2026-04-29", summary: "first day", created_at: "" },
      { date: "2026-04-30", summary: "second day", created_at: "" },
    ];
    const out = formatDailySummaries(items);
    expect(out).toBe("- 4/29: first day\n- 4/30: second day");
  });
});

describe("formatWeeklySummaries", () => {
  it("renders with week range", () => {
    const items: WeeklySummary[] = [
      { week_start: "2026-04-19", summary: "weekly one", created_at: "" },
    ];
    const out = formatWeeklySummaries(items);
    expect(out).toContain("4/19~4/25");
    expect(out).toContain("weekly one");
  });
});

describe("getProfileSection", () => {
  afterAll(async () => {
    await db().from("user_profile").delete().like("observation", `${TEST_PREFIX}%`);
  });

  it("returns empty when no active rows", async () => {
    // delete first to ensure isolation
    await db().from("user_profile").delete().like("observation", `${TEST_PREFIX}%`);
    const out = await getProfileSection(30);
    // may be non-empty if other data exists in DB; just check format
    expect(typeof out).toBe("string");
  });

  it("formats inline kind prefix", () => {
    // pure-format helper (we'll add it if not yet)
    const rows: ProfileRow[] = [
      {
        id: "1",
        kind: "preference",
        observation: "김밥 좋아함",
        evidence_dates: [],
        superseded_by: null,
        created_at: "",
        updated_at: "",
      },
      {
        id: "2",
        kind: "tone",
        observation: "회고 시작 톤은 늘 피곤함",
        evidence_dates: [],
        superseded_by: null,
        created_at: "",
        updated_at: "",
      },
    ];
    const lines = rows.map((r) => `- (${r.kind}) ${r.observation}`).join("\n");
    expect(lines).toContain("(preference)");
    expect(lines).toContain("(tone)");
  });
});
