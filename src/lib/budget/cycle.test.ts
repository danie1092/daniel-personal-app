import { describe, test, expect } from "vitest";
import { budgetMonthOf, budgetMonthRange, cycleDays, prevBudgetMonth } from "./cycle";
import { BUDGET_RESET_DAY as R } from "@/lib/constants";

// 리셋일 값(R)에 무관하게 성립하는 불변식 위주 — 상수 바꿔도 안 깨짐.
describe("budgetMonthOf", () => {
  test("리셋일 당일은 그 달 사이클", () => {
    expect(budgetMonthOf(new Date(2026, 5, R))).toBe("2026-06");
  });
  test("리셋일 이전(R>1)은 이전 달 사이클, 연 롤오버 포함", () => {
    if (R > 1) {
      expect(budgetMonthOf(new Date(2026, 5, R - 1))).toBe("2026-05");
      expect(budgetMonthOf(new Date(2026, 0, R - 1))).toBe("2025-12");
    } else {
      // R=1: 모든 날이 그 달
      expect(budgetMonthOf(new Date(2026, 5, 1))).toBe("2026-06");
      expect(budgetMonthOf(new Date(2026, 0, 1))).toBe("2026-01");
    }
  });
});

describe("prevBudgetMonth", () => {
  test("한 달 전 라벨, 연 롤오버 포함", () => {
    expect(prevBudgetMonth("2026-06")).toBe("2026-05");
    expect(prevBudgetMonth("2026-01")).toBe("2025-12");
    expect(prevBudgetMonth("2026-10")).toBe("2026-09");
  });
});

describe("budgetMonthRange", () => {
  test("시작일 = 리셋일", () => {
    expect(budgetMonthRange("2026-06").start).toBe(`2026-06-${String(R).padStart(2, "0")}`);
  });
  test("사이클은 연속 — 끝+1 = 다음 사이클 시작 (연 롤오버 포함)", () => {
    for (const [ym, next] of [["2026-06", "2026-07"], ["2026-12", "2027-01"]] as const) {
      const a = budgetMonthRange(ym);
      const b = budgetMonthRange(next);
      const after = new Date(`${a.end}T00:00:00`);
      after.setDate(after.getDate() + 1);
      const iso = `${after.getFullYear()}-${String(after.getMonth() + 1).padStart(2, "0")}-${String(after.getDate()).padStart(2, "0")}`;
      expect(iso).toBe(b.start);
    }
  });
  test("R=1이면 달력월(1일~말일)", () => {
    if (R === 1) {
      expect(budgetMonthRange("2026-06")).toEqual({ start: "2026-06-01", end: "2026-06-30" });
      expect(budgetMonthRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    }
  });
});

describe("cycleDays", () => {
  test("진행 중 사이클: 1 ≤ daysIntoCycle ≤ daysInCycle", () => {
    const today = new Date(2026, 5, 26);
    const { daysInCycle, daysIntoCycle } = cycleDays(budgetMonthOf(today), today);
    expect(daysIntoCycle).toBeGreaterThanOrEqual(1);
    expect(daysIntoCycle).toBeLessThanOrEqual(daysInCycle);
  });
  test("과거 사이클이면 전체 일수", () => {
    const { daysInCycle, daysIntoCycle } = cycleDays("2026-06", new Date(2026, 9, 1));
    expect(daysIntoCycle).toBe(daysInCycle);
  });
});
