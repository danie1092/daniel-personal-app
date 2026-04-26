import { describe, test, expect, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));

import { getMonthGraphData } from "./graphData";

function makeItemsChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => Promise.resolve({ data, error: null }));
  return chain;
}

function makeChecksChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  chain.eq = vi.fn(() => Promise.resolve({ data, error: null }));
  return chain;
}

describe("getMonthGraphData", () => {
  beforeEach(() => {
    fromMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 27, 12, 0, 0)); // 4/27
  });

  test("월 그리드 + Done/Progress + Streaks 정상 계산 (4월: 30일)", async () => {
    fromMock
      .mockReturnValueOnce(makeItemsChain([
        { id: "i1", name: "운동", emoji: "🏃" },
        { id: "i2", name: "영양제", emoji: "💊" },
      ]))
      .mockReturnValueOnce(makeChecksChain([
        { item_id: "i1", date: "2026-04-25", checked: true },
        { item_id: "i1", date: "2026-04-26", checked: true },
        { item_id: "i1", date: "2026-04-27", checked: true },
        { item_id: "i2", date: "2026-04-26", checked: true },
        { item_id: "i2", date: "2026-04-27", checked: true },
      ]));

    const result = await getMonthGraphData("2026-04");

    expect(result.yearMonth).toBe("2026-04");
    expect(result.items.length).toBe(2);
    expect(result.rows.length).toBe(2);

    // 4월은 30일 → 각 row의 cells.length === 30
    expect(result.rows[0].cells.length).toBe(30);
    expect(result.rows[1].cells.length).toBe(30);

    // i1 운동: 4/25, 4/26, 4/27 체크 → total 3
    expect(result.rows[0].total).toBe(3);
    expect(result.rows[0].cells[24].checked).toBe(true);  // 4/25 (index 24)
    expect(result.rows[0].cells[25].checked).toBe(true);  // 4/26
    expect(result.rows[0].cells[26].checked).toBe(true);  // 4/27
    expect(result.rows[0].cells[0].checked).toBe(false);  // 4/1

    // dayTotals.length === 30
    expect(result.dayTotals.length).toBe(30);
    // 4/27 (index 26): 둘 다 체크 → done=2, total=2, pct=100
    expect(result.dayTotals[26].done).toBe(2);
    expect(result.dayTotals[26].total).toBe(2);
    expect(result.dayTotals[26].pct).toBe(100);
    // 4/25 (index 24): i1만 체크 → done=1, pct=50
    expect(result.dayTotals[24].done).toBe(1);
    expect(result.dayTotals[24].pct).toBe(50);
    // 4/1 (index 0): 아무도 체크 안 함 → done=0, pct=0
    expect(result.dayTotals[0].done).toBe(0);
    expect(result.dayTotals[0].pct).toBe(0);
  });

  test("Streak 계산: 오늘부터 거꾸로 연속 체크된 일수", async () => {
    // 오늘 = 4/27. i1: 4/25, 4/26, 4/27 연속 → streak=3. i2: 4/26, 4/27 연속 → streak=2
    fromMock
      .mockReturnValueOnce(makeItemsChain([
        { id: "i1", name: "운동", emoji: "🏃" },
        { id: "i2", name: "영양제", emoji: "💊" },
      ]))
      .mockReturnValueOnce(makeChecksChain([
        { item_id: "i1", date: "2026-04-25", checked: true },
        { item_id: "i1", date: "2026-04-26", checked: true },
        { item_id: "i1", date: "2026-04-27", checked: true },
        { item_id: "i2", date: "2026-04-26", checked: true },
        { item_id: "i2", date: "2026-04-27", checked: true },
      ]));

    const result = await getMonthGraphData("2026-04");
    expect(result.streaks.length).toBe(2);
    // 큰 순 정렬 → i1(3) 먼저
    expect(result.streaks[0].item.id).toBe("i1");
    expect(result.streaks[0].currentStreak).toBe(3);
    expect(result.streaks[1].item.id).toBe("i2");
    expect(result.streaks[1].currentStreak).toBe(2);
  });

  test("Streak 끊김: 어제 체크 없으면 streak=0 (오늘 미체크)", async () => {
    fromMock
      .mockReturnValueOnce(makeItemsChain([
        { id: "i1", name: "운동", emoji: "🏃" },
      ]))
      .mockReturnValueOnce(makeChecksChain([
        { item_id: "i1", date: "2026-04-25", checked: true },
        { item_id: "i1", date: "2026-04-26", checked: true },
        // 4/27 = 오늘, 미체크
      ]));

    const result = await getMonthGraphData("2026-04");
    // 오늘 미체크면 streak는 어제까지 — 우리 정의로 어떻게 처리?
    // 간단한 정의: "오늘 또는 어제부터 거꾸로 연속" — 단순하게 "오늘부터 거꾸로 첫 체크된 날부터의 연속"
    // 오늘 미체크면 0
    expect(result.streaks[0].currentStreak).toBe(0);
  });

  test("항목 0개면 빈 결과", async () => {
    fromMock
      .mockReturnValueOnce(makeItemsChain([]))
      .mockReturnValueOnce(makeChecksChain([]));

    const result = await getMonthGraphData("2026-04");
    expect(result.items).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.streaks).toEqual([]);
    // dayTotals는 여전히 30일치 (단 total=0, pct=0)
    expect(result.dayTotals.length).toBe(30);
    expect(result.dayTotals[0].total).toBe(0);
    expect(result.dayTotals[0].pct).toBe(0);
  });
});
