import { describe, test, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));

import { getBudgetSummary } from "./summary";
import { cycleDays, budgetMonthOf } from "./cycle";
import { VARIABLE_BUDGET } from "@/lib/constants";

function makeChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  chain.neq = vi.fn(() => chain);
  chain.eq = vi.fn(() => Promise.resolve({ data, error: null }));
  return chain;
}

/** 쿼리 2개(이번 사이클, 지난 사이클 같은 시점) 순서대로 mock */
function mockQueries(current: unknown, prev: unknown) {
  fromMock.mockReturnValueOnce(makeChain(current)).mockReturnValueOnce(makeChain(prev));
}

describe("getBudgetSummary", () => {
  beforeEach(() => {
    fromMock.mockReset();
    vi.useFakeTimers();
    // 2026-04-26 일요일 (로컬 자정으로 고정)
    vi.setSystemTime(new Date(2026, 3, 26, 12, 0, 0));
  });

  test("월/오늘 지출 누적 + 미분류 건수 — 고정비는 변동지출에서 제외, 총지출엔 포함", async () => {
    mockQueries(
      [
        { amount: 12000, date: "2026-04-26", category: "외식" },
        { amount: 6500, date: "2026-04-26", category: "미분류" },
        { amount: 14000, date: "2026-04-25", category: "카페" },
        { amount: 50000, date: "2026-04-20", category: "미분류" },
        { amount: 290000, date: "2026-04-15", category: "고정비" },
      ],
      []
    );

    const result = await getBudgetSummary();
    expect(result.todaySpending).toBe(18500);
    expect(result.monthSpending).toBe(82500); // 고정비 제외
    expect(result.monthSpendingWithFixed).toBe(372500); // 고정비 포함
    expect(result.uncategorizedCount).toBe(2);
    expect(result.daysIntoMonth).toBe(cycleDays(budgetMonthOf(new Date()), new Date()).daysIntoCycle);
  });

  test("고정비만 있는 날은 무지출로 친다 (행동 지표는 변동지출 기준)", async () => {
    mockQueries(
      [
        { amount: 12000, date: "2026-04-24", category: "외식" },
        { amount: 290000, date: "2026-04-26", category: "고정비" },
      ],
      []
    );
    const result = await getBudgetSummary();
    // 4/25, 4/26 모두 변동지출 없음 → 스트릭 2
    expect(result.noSpendStreak).toBe(2);
  });

  test("무지출 일수/스트릭 — 지출일 3일이면 나머지가 무지출", async () => {
    mockQueries(
      [
        { amount: 12000, date: "2026-04-24", category: "외식" },
        { amount: 6500, date: "2026-04-20", category: "카페" },
      ],
      []
    );
    const result = await getBudgetSummary();
    const { daysIntoCycle } = cycleDays(budgetMonthOf(new Date()), new Date());
    expect(result.noSpendDays).toBe(daysIntoCycle - 2);
    expect(result.noSpendStreak).toBe(2); // 4/25, 4/26
  });

  test("지난 사이클 데이터 있으면 같은 시점까지 합계, 없으면 null", async () => {
    mockQueries([], [{ amount: 30000 }, { amount: 20000 }]);
    expect((await getBudgetSummary()).prevSpendingSamePoint).toBe(50000);

    mockQueries([], []);
    expect((await getBudgetSummary()).prevSpendingSamePoint).toBeNull();
  });

  test("데이터가 비어도 0으로 반환", async () => {
    mockQueries([], []);
    const result = await getBudgetSummary();
    expect(result.todaySpending).toBe(0);
    expect(result.monthSpending).toBe(0);
    expect(result.uncategorizedCount).toBe(0);
  });

  test("monthlyBudget은 변동예산(고정비 제외) 반환", async () => {
    mockQueries([], []);
    const result = await getBudgetSummary();
    expect(result.monthlyBudget).toBe(VARIABLE_BUDGET);
    expect(result.monthlyBudget).toBe(1_178_000);
  });
});
