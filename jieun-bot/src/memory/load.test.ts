import { describe, it, expect, vi } from "vitest";
import {
  formatRecentConversations,
  formatDailySummaries,
  formatWeeklySummaries,
  getProfileSection,
} from "./load.js";
import type { DailySummary } from "../db/dailySummary.js";
import type { WeeklySummary } from "../db/weeklySummary.js";
import type { ProfileRow } from "../db/userProfile.js";
import { fetchActiveProfile } from "../db/userProfile.js";

vi.mock("../db/userProfile.js", () => ({
  fetchActiveProfile: vi.fn(),
}));

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
  it("returns empty string when fetchActiveProfile returns no rows", async () => {
    vi.mocked(fetchActiveProfile).mockResolvedValueOnce([]);
    const out = await getProfileSection(30);
    expect(out).toBe("");
  });

  it("formats inline kind prefix from fetched rows", async () => {
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
    vi.mocked(fetchActiveProfile).mockResolvedValueOnce(rows);
    const out = await getProfileSection(30);
    // Expected order: oldest first (slice().reverse() in impl)
    // Input is rows[0]=preference, rows[1]=tone (newest first, since fetchActiveProfile returns desc)
    // Reverse → tone first, then preference
    expect(out).toContain("- (preference) 김밥 좋아함");
    expect(out).toContain("- (tone) 회고 시작 톤은 늘 피곤함");
    // Verify reverse order: tone line appears before preference line
    expect(out.indexOf("- (tone)")).toBeLessThan(out.indexOf("- (preference)"));
  });
});
