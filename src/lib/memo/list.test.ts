import { describe, test, expect, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));

import { getAllMemos } from "./list";

function makeOrderChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
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
