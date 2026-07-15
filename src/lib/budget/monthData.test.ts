import { describe, test, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));

vi.mock("./customCategories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./customCategories")>();
  return { ...actual, getCustomCategories: vi.fn(async () => []) };
});

import { getMonthEntries, getMonthSummary, getCategoryBreakdown, getRecentCycleSpending } from "./monthData";
import { cycleDays, budgetMonthRange } from "./cycle";

function makeChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  chain.order = vi.fn(() => Promise.resolve({ data, error: null }));
  return chain;
}

describe("getMonthEntries", () => {
  beforeEach(() => fromMock.mockReset());

  test("YYYY-MM 입력하면 해당 월 entries 반환", async () => {
    fromMock.mockReturnValueOnce(makeChain([
      { id: "e1", date: "2026-04-26", category: "식사", description: "김치찌개", memo: null, amount: 12000, payment_method: "우리카드", type: "expense", created_at: "2026-04-26T13:24:00Z" },
    ]));
    const result = await getMonthEntries("2026-04");
    expect(result.length).toBe(1);
    expect(result[0].category).toBe("식사");
  });

  test("data가 null이면 빈 배열", async () => {
    fromMock.mockReturnValueOnce(makeChain(null));
    const result = await getMonthEntries("2026-04");
    expect(result).toEqual([]);
  });
});

describe("getMonthSummary", () => {
  beforeEach(() => {
    fromMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 26, 12, 0, 0));
  });

  test("expense/income/saving 합산 + 잔액 계산", async () => {
    fromMock.mockReturnValueOnce(makeChain([
      { type: "expense", category: "외식", amount: 12000 },
      { type: "expense", category: "카페", amount: 6500 },
      { type: "expense", category: "고정비", amount: 200000 },
      { type: "income", category: "월급", amount: 3_000_000 },
      { type: "saving", category: "저축", amount: 500_000 },
    ]));

    // 두 번째 from() = fixed_expenses 합계, 세 번째 = budget_plans 오버라이드
    const fixedChain = { select: vi.fn(() => Promise.resolve({ data: [{ amount: 1_081_000 }], error: null })) };
    fromMock.mockReturnValueOnce(fixedChain);
    const planChain: Record<string, unknown> = {};
    planChain.select = vi.fn(() => planChain);
    planChain.eq = vi.fn(() => Promise.resolve({ data: [], error: null }));
    fromMock.mockReturnValueOnce(planChain);

    const result = await getMonthSummary("2026-04");
    expect(result.spending).toBe(18500);
    expect(result.spendingWithFixed).toBe(218500);
    expect(result.income).toBe(3_000_000);
    expect(result.saving).toBe(500_000);
    expect(result.remaining).toBe(3_000_000 - 218500 - 500_000);
    expect(result.monthlyBudget).toBe(2_259_000);
    expect(result.variableBudget).toBe(1_178_000);
    // 일수는 리셋일 설정(BUDGET_RESET_DAY)에 따라 달라지므로 cycle 헬퍼에서 파생해 검증
    const exp = cycleDays("2026-04", new Date());
    expect(result.daysInMonth).toBe(exp.daysInCycle);
    expect(result.daysIntoMonth).toBe(exp.daysIntoCycle);
  });
});

describe("getRecentCycleSpending", () => {
  beforeEach(() => fromMock.mockReset());

  test("사이클별 변동지출 합, 과거→현재 순", async () => {
    // 쿼리 체인: select→gte→lte→neq→eq(resolve)
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.gte = vi.fn(() => chain);
    chain.lte = vi.fn(() => chain);
    chain.neq = vi.fn(() => chain);
    chain.eq = vi.fn(() =>
      Promise.resolve({
        data: [
          { amount: 100, date: budgetMonthRange("2026-02").start },
          { amount: 200, date: budgetMonthRange("2026-03").start },
          { amount: 300, date: budgetMonthRange("2026-03").end },
          { amount: 400, date: budgetMonthRange("2026-04").start },
        ],
        error: null,
      })
    );
    fromMock.mockReturnValueOnce(chain);

    const result = await getRecentCycleSpending("2026-04", 3);
    expect(result).toEqual([
      { yearMonth: "2026-02", spending: 100 },
      { yearMonth: "2026-03", spending: 500 },
      { yearMonth: "2026-04", spending: 400 },
    ]);
  });
});

describe("getCategoryBreakdown", () => {
  beforeEach(() => fromMock.mockReset());

  test("expense만 카테고리별로 묶어서 큰 순 정렬", async () => {
    fromMock.mockReturnValueOnce(makeChain([
      { type: "expense", category: "식사", amount: 12000 },
      { type: "expense", category: "식사", amount: 8000 },
      { type: "expense", category: "카페", amount: 6500 },
      { type: "income", category: "월급", amount: 3_000_000 },
    ]));

    const result = await getCategoryBreakdown("2026-04");
    expect(result.length).toBe(2);
    expect(result[0].category).toBe("식사");
    expect(result[0].amount).toBe(20000);
    expect(result[0].pct).toBeCloseTo(20000 / 26500);
    expect(result[1].category).toBe("카페");
  });
});
