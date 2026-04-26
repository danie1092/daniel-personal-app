import { describe, test, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));

import { getBudgetSummary } from "./summary";

function makeChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  chain.neq = vi.fn(() => Promise.resolve({ data, error: null }));
  return chain;
}

describe("getBudgetSummary", () => {
  beforeEach(() => {
    fromMock.mockReset();
    vi.useFakeTimers();
    // 2026-04-26 일요일 (로컬 자정으로 고정)
    vi.setSystemTime(new Date(2026, 3, 26, 12, 0, 0));
  });

  test("월/주/오늘 지출이 누적된다", async () => {
    fromMock.mockReturnValueOnce(makeChain([
      { amount: 12000, date: "2026-04-26" },  // 오늘 (일요일, 이번 주 시작)
      { amount: 6500, date: "2026-04-26" },   // 오늘
      { amount: 14000, date: "2026-04-25" },  // 어제 (지난 주 — Sunday-start 기준)
      { amount: 50000, date: "2026-04-20" },  // 4월, 지난 주
    ]));

    const result = await getBudgetSummary();
    expect(result.todaySpending).toBe(18500);  // 오늘 2건
    expect(result.weekSpending).toBe(18500);    // 4/26(일) 시작 주, 오늘만 포함
    expect(result.monthSpending).toBe(82500);   // 4월 전체
    expect(result.daysIntoMonth).toBe(26);
  });

  test("데이터가 비어도 0으로 반환", async () => {
    fromMock.mockReturnValueOnce(makeChain([]));
    const result = await getBudgetSummary();
    expect(result.todaySpending).toBe(0);
    expect(result.weekSpending).toBe(0);
    expect(result.monthSpending).toBe(0);
  });

  test("monthlyBudget은 상수 2_000_000 반환", async () => {
    fromMock.mockReturnValueOnce(makeChain([]));
    const result = await getBudgetSummary();
    expect(result.monthlyBudget).toBe(2_000_000);
  });
});
