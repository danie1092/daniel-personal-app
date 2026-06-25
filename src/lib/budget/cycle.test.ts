import { describe, test, expect } from "vitest";
import { budgetMonthOf, budgetMonthRange, cycleDays } from "./cycle";
import { BUDGET_RESET_DAY } from "@/lib/constants";

// 아래 구체 단언은 현재 리셋일=5 기준. 상수 바뀌면 같이 갱신.
describe("budgetMonthOf (리셋일=5)", () => {
  test("리셋일 이후는 그 달 사이클", () => {
    expect(budgetMonthOf(new Date(2026, 5, 5))).toBe("2026-06"); // 6/5
    expect(budgetMonthOf(new Date(2026, 5, 26))).toBe("2026-06"); // 6/26
  });
  test("리셋일 이전은 이전 달 사이클 (연 롤오버 포함)", () => {
    expect(budgetMonthOf(new Date(2026, 6, 4))).toBe("2026-06"); // 7/4 → 6월 사이클 끝
    expect(budgetMonthOf(new Date(2026, 0, 3))).toBe("2025-12"); // 1/3 → 작년 12월
  });
});

describe("budgetMonthRange (리셋일=5)", () => {
  test("6월 사이클 = 6/5 ~ 7/4", () => {
    expect(budgetMonthRange("2026-06")).toEqual({ start: "2026-06-05", end: "2026-07-04" });
  });
  test("12월 사이클 = 12/5 ~ 다음해 1/4 (연 롤오버)", () => {
    expect(budgetMonthRange("2026-12")).toEqual({ start: "2026-12-05", end: "2027-01-04" });
  });
});

describe("cycleDays", () => {
  test("진행 중 사이클의 며칠째", () => {
    const { daysInCycle, daysIntoCycle } = cycleDays("2026-06", new Date(2026, 5, 26)); // 6/26
    expect(daysInCycle).toBe(30); // 6/5~7/4
    expect(daysIntoCycle).toBe(22); // 6/5~6/26
  });
  test("과거 사이클이면 전체 일수", () => {
    const { daysInCycle, daysIntoCycle } = cycleDays("2026-06", new Date(2026, 8, 1)); // 9월
    expect(daysIntoCycle).toBe(daysInCycle);
  });
});

describe("불변식 (리셋일 무관)", () => {
  test("시작일=리셋일, 사이클 연속(끝+1=다음 시작)", () => {
    const a = budgetMonthRange("2026-06");
    const b = budgetMonthRange("2026-07");
    expect(Number(a.start.split("-")[2])).toBe(BUDGET_RESET_DAY);
    const next = new Date(`${a.end}T00:00:00`);
    next.setDate(next.getDate() + 1);
    const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    expect(iso).toBe(b.start);
  });
});
