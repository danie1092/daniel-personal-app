import { describe, it, expect } from "vitest";
import { formatRecentConversations } from "./load.js";

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
