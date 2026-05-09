import { describe, it, expect } from "vitest";
import { countConsecutiveBotWithoutUser } from "./backoff.js";

type Row = { role: "user" | "bot" | "system"; created_at: string };

describe("countConsecutiveBotWithoutUser (newest-first input)", () => {
  it("3 bot in a row without user → 3", () => {
    const rows: Row[] = [
      { role: "bot", created_at: "" },
      { role: "bot", created_at: "" },
      { role: "bot", created_at: "" },
    ];
    expect(countConsecutiveBotWithoutUser(rows)).toBe(3);
  });

  it("user message breaks the streak", () => {
    const rows: Row[] = [
      { role: "bot", created_at: "" },
      { role: "user", created_at: "" },
      { role: "bot", created_at: "" },
    ];
    expect(countConsecutiveBotWithoutUser(rows)).toBe(1);
  });

  it("system messages don't break and don't count", () => {
    const rows: Row[] = [
      { role: "system", created_at: "" },
      { role: "bot", created_at: "" },
      { role: "bot", created_at: "" },
    ];
    expect(countConsecutiveBotWithoutUser(rows)).toBe(2);
  });

  it("empty → 0", () => {
    expect(countConsecutiveBotWithoutUser([])).toBe(0);
  });
});
