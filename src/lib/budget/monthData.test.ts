import { describe, test, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));

import { getMonthEntries, getMonthSummary, getCategoryBreakdown } from "./monthData";

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
      { type: "expense", category: "식사", amount: 12000 },
      { type: "expense", category: "카페", amount: 6500 },
      { type: "expense", category: "고정지출", amount: 200000 },
      { type: "income", category: "월급", amount: 3_000_000 },
      { type: "saving", category: "저축", amount: 500_000 },
    ]));

    const result = await getMonthSummary("2026-04");
    expect(result.spending).toBe(18500);
    expect(result.spendingWithFixed).toBe(218500);
    expect(result.income).toBe(3_000_000);
    expect(result.saving).toBe(500_000);
    expect(result.remaining).toBe(3_000_000 - 18500 - 500_000);
    expect(result.monthlyBudget).toBe(2_000_000);
    expect(result.daysInMonth).toBe(30);
    expect(result.daysIntoMonth).toBe(26);
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
