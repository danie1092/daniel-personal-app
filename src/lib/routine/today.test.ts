import { describe, test, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));

import { getTodayRoutine } from "./today";

function makeItemsChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => Promise.resolve({ data, error: null }));
  return chain;
}

function makeChecksChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  let eqCalls = 0;
  chain.eq = vi.fn(() => {
    eqCalls++;
    if (eqCalls < 2) return chain;
    return Promise.resolve({ data, error: null });
  });
  return chain;
}

describe("getTodayRoutine", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  test("완료/총/남은 항목 반환", async () => {
    fromMock
      .mockReturnValueOnce(makeItemsChain([
        { id: "i1", name: "운동", emoji: "🏃" },
        { id: "i2", name: "영양제", emoji: "💊" },
        { id: "i3", name: "독서", emoji: "📖" },
      ]))
      .mockReturnValueOnce(makeChecksChain([
        { item_id: "i2", checked: true },
      ]));

    const result = await getTodayRoutine();
    expect(result.total).toBe(3);
    expect(result.completed).toBe(1);
    expect(result.remaining.map((r) => r.id)).toEqual(["i1", "i3"]);
  });

  test("아무 항목 없으면 0/0/[]", async () => {
    fromMock
      .mockReturnValueOnce(makeItemsChain([]))
      .mockReturnValueOnce(makeChecksChain([]));

    const result = await getTodayRoutine();
    expect(result.total).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.remaining).toEqual([]);
  });
});
