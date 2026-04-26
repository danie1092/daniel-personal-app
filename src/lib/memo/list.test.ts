import { describe, test, expect, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));

import { getAllMemos, getInboxCount, getInboxItems } from "./list";

function makeOrderChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => Promise.resolve({ data, error: null }));
  return chain;
}

function makeCountChain(count: number) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => Promise.resolve({ count, data: null, error: null }));
  return chain;
}

function makeFilteredOrderChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => Promise.resolve({ data, error: null }));
  return chain;
}

describe("getAllMemos", () => {
  beforeEach(() => fromMock.mockReset());

  test("최근 순으로 모든 메모 반환", async () => {
    fromMock.mockReturnValueOnce(makeOrderChain([
      { id: "m1", content: "첫", tag: "발견", created_at: "2026-04-27T10:00:00Z" },
      { id: "m2", content: "두번째", tag: "생각중", created_at: "2026-04-26T09:00:00Z" },
    ]));
    const result = await getAllMemos();
    expect(result.length).toBe(2);
    expect(result[0].content).toBe("첫");
  });

  test("data null이면 빈 배열", async () => {
    fromMock.mockReturnValueOnce(makeOrderChain(null));
    const result = await getAllMemos();
    expect(result).toEqual([]);
  });
});

describe("getInboxCount", () => {
  beforeEach(() => fromMock.mockReset());

  test("미처리 항목 수 반환", async () => {
    fromMock.mockReturnValueOnce(makeCountChain(7));
    const result = await getInboxCount();
    expect(result).toBe(7);
  });

  test("count null이면 0", async () => {
    fromMock.mockReturnValueOnce(makeCountChain(null as unknown as number));
    const result = await getInboxCount();
    expect(result).toBe(0);
  });
});

describe("getInboxItems", () => {
  beforeEach(() => fromMock.mockReset());

  test("미처리 collected_items 반환", async () => {
    fromMock.mockReturnValueOnce(makeFilteredOrderChain([
      { id: "c1", url: "https://instagram.com/p/x", memo: null, source: "instagram", created_at: "2026-04-27T10:00:00Z" },
    ]));
    const result = await getInboxItems();
    expect(result.length).toBe(1);
    expect(result[0].url).toContain("instagram");
  });
});
