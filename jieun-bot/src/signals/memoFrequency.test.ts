import { describe, it, expect } from "vitest";
import { computeMemoFrequency, type MemoRow } from "./memoFrequency.js";

const today = new Date("2026-05-15T12:00:00+09:00");

function memo(daysAgo: number): MemoRow {
  const d = new Date(today.getTime() - daysAgo * 86400 * 1000);
  return { created_at: d.toISOString() };
}

describe("computeMemoFrequency", () => {
  it("returns null when no memos", () => {
    expect(computeMemoFrequency([], today)).toBeNull();
  });

  it("returns null when in normal range", () => {
    const rows = [memo(2), memo(5), memo(10), memo(12)];
    expect(computeMemoFrequency(rows, today)).toBeNull();
  });

  it("flags drop (recent <30% of prior)", () => {
    const rows = [
      memo(2),
      memo(8), memo(9), memo(10), memo(11),
    ];
    const r = computeMemoFrequency(rows, today);
    expect(r?.kind).toBe("memo_frequency_shift");
    expect(r?.evidence.direction).toBe("drop");
  });

  it("flags surge (recent >3x prior)", () => {
    const rows = [
      memo(1), memo(2), memo(3), memo(4), memo(5),
      memo(10),
    ];
    const r = computeMemoFrequency(rows, today);
    expect(r?.evidence.direction).toBe("surge");
  });
});
