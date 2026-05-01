import { describe, it, expect } from "vitest";
import { computeCategoryOutlier, type BudgetRow } from "./categoryOutlier.js";

const today = new Date("2026-05-01T12:00:00+09:00");

function row(daysAgo: number, category: string, amount: number): BudgetRow {
  const d = new Date(today.getTime() - daysAgo * 86400 * 1000);
  return {
    date: d.toISOString().slice(0, 10),
    category,
    amount,
    type: "expense",
  };
}

describe("computeCategoryOutlier", () => {
  it("returns null when no data", () => {
    expect(computeCategoryOutlier([], today)).toBeNull();
  });

  it("returns null when this week within baseline", () => {
    // Baseline 4 weeks at days 8/15/22/29 (each in prior bucket via days>=7),
    // this week's spend matches per-week avg (100k).
    const rows = [
      ...Array.from({ length: 4 }, (_, w) => row(w * 7 + 8, "식사", 100000)),
      row(2, "식사", 50000),
      row(0, "식사", 50000),
    ];
    expect(computeCategoryOutlier(rows, today)).toBeNull();
  });

  it("flags outlier when this week >=1.5x avg AND >=50k", () => {
    const rows = [
      row(28, "식사", 50000),
      row(21, "식사", 50000),
      row(14, "식사", 50000),
      row(7, "식사", 50000),
      row(3, "식사", 50000),
      row(1, "식사", 50000),
    ];
    const r = computeCategoryOutlier(rows, today);
    expect(r).not.toBeNull();
    expect(r?.kind).toBe("category_outlier");
    expect(r?.evidence.category).toBe("식사");
    expect(r?.evidence.thisWeek).toBe(100000);
    expect(r?.evidence.weeklyAvg).toBe(50000);
  });

  it("does not flag when ratio high but absolute < 50k", () => {
    const rows = [
      row(28, "카페", 10000),
      row(21, "카페", 10000),
      row(14, "카페", 10000),
      row(7, "카페", 10000),
      row(0, "카페", 30000),
    ];
    expect(computeCategoryOutlier(rows, today)).toBeNull();
  });

  it("ignores 고정지출 (always recurring, not actionable)", () => {
    const rows = [
      row(28, "고정지출", 50000),
      row(21, "고정지출", 50000),
      row(14, "고정지출", 50000),
      row(7, "고정지출", 50000),
      row(0, "고정지출", 200000),
    ];
    expect(computeCategoryOutlier(rows, today)).toBeNull();
  });
});
