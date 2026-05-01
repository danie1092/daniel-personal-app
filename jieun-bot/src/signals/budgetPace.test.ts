import { describe, it, expect } from "vitest";
import { computeBudgetPace, type BudgetRow } from "./budgetPace.js";

describe("computeBudgetPace", () => {
  it("returns null when no rows", () => {
    expect(computeBudgetPace([], new Date("2026-05-15T12:00:00+09:00"), 2_000_000)).toBeNull();
  });

  it("returns null when within pace", () => {
    const rows: BudgetRow[] = [
      { date: "2026-05-10", category: "식사", amount: 500000, type: "expense" },
      { date: "2026-05-12", category: "교통", amount: 400000, type: "expense" },
    ];
    expect(computeBudgetPace(rows, new Date("2026-05-15T12:00:00+09:00"), 2_000_000)).toBeNull();
  });

  it("flags overpace when ratio >= 1.2", () => {
    const rows: BudgetRow[] = [
      { date: "2026-05-10", category: "식사", amount: 800000, type: "expense" },
      { date: "2026-05-12", category: "교통", amount: 500000, type: "expense" },
    ];
    const r = computeBudgetPace(rows, new Date("2026-05-15T12:00:00+09:00"), 2_000_000);
    expect(r).not.toBeNull();
    expect(r?.kind).toBe("budget_pace");
    expect(r?.evidence.actual).toBe(1_300_000);
    expect((r?.evidence.expected as number)).toBeGreaterThan(900_000);
    expect((r?.evidence.expected as number)).toBeLessThan(1_000_000);
  });

  it("excludes 고정지출 + income + saving from spend", () => {
    const rows: BudgetRow[] = [
      { date: "2026-05-01", category: "고정지출", amount: 1_000_000, type: "expense" },
      { date: "2026-05-01", category: "월급", amount: 3_000_000, type: "income" },
      { date: "2026-05-10", category: "식사", amount: 100_000, type: "expense" },
    ];
    const r = computeBudgetPace(rows, new Date("2026-05-15T12:00:00+09:00"), 2_000_000);
    expect(r).toBeNull();
  });
});
