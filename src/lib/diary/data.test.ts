import { describe, test, expect, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));

import { getTodayDiary, getRecentDiaries, getMonthGrass } from "./data";

function makeSingleChain(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data, error }));
  return chain;
}

function makeListChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.lt = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve({ data, error: null }));
  // 추가: order 호출 후 promise 자체를 리턴할 수도
  chain.order = vi.fn(() => Promise.resolve({ data, error: null }));
  return chain;
}

describe("getTodayDiary", () => {
  beforeEach(() => fromMock.mockReset());

  test("오늘 일기 반환", async () => {
    fromMock.mockReturnValueOnce(makeSingleChain({
      id: "d1", date: "2026-04-27", content: "오늘은 좋은 하루", emotion: "😊 행복",
    }));
    const r = await getTodayDiary("2026-04-27");
    expect(r?.content).toBe("오늘은 좋은 하루");
  });

  test("없으면 null", async () => {
    fromMock.mockReturnValueOnce(makeSingleChain(null));
    const r = await getTodayDiary("2026-04-27");
    expect(r).toBeNull();
  });
});

describe("getRecentDiaries", () => {
  beforeEach(() => fromMock.mockReset());

  test("limit=30 기본, 최근 순", async () => {
    fromMock.mockReturnValueOnce(makeListChain([
      { id: "d1", date: "2026-04-26", content: "어제", emotion: "😌 평온" },
      { id: "d2", date: "2026-04-25", content: "그제", emotion: null },
    ]));
    const r = await getRecentDiaries("2026-04-27");
    expect(r.length).toBe(2);
  });

  test("data null이면 빈 배열", async () => {
    fromMock.mockReturnValueOnce(makeListChain(null));
    const r = await getRecentDiaries("2026-04-27");
    expect(r).toEqual([]);
  });
});

describe("getMonthGrass", () => {
  beforeEach(() => fromMock.mockReset());

  test("월의 30일 잔디 (작성한 날 = entry, 안 한 날 = null)", async () => {
    fromMock.mockReturnValueOnce(makeListChain([
      { id: "d1", date: "2026-04-26", content: "x", emotion: "😊 행복" },
      { id: "d2", date: "2026-04-20", content: "y", emotion: null },
    ]));
    const r = await getMonthGrass("2026-04");
    expect(r.length).toBe(30);  // 4월 30일
    expect(r[25].entry?.id).toBe("d1");  // 4/26 (index 25)
    expect(r[19].entry?.id).toBe("d2");  // 4/20 (index 19)
    expect(r[0].entry).toBeNull();        // 4/1
  });
});
