import { describe, test, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));

import { getRecentMemos } from "./recent";

function makeChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve({ data, error: null }));
  return chain;
}

describe("getRecentMemos", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  test("기본 limit=3, 최근 메모 배열 반환", async () => {
    fromMock.mockReturnValueOnce(makeChain([
      { id: "m1", content: "첫 메모", tag: "발견", created_at: "2026-04-26T10:00:00Z" },
      { id: "m2", content: "두번째", tag: "생각중", created_at: "2026-04-26T09:00:00Z" },
    ]));

    const result = await getRecentMemos();
    expect(result.length).toBe(2);
    expect(result[0].content).toBe("첫 메모");
  });

  test("limit 인자 사용 가능", async () => {
    const chain = makeChain([]);
    fromMock.mockReturnValueOnce(chain);
    await getRecentMemos(10);
    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  test("data가 null이면 빈 배열", async () => {
    fromMock.mockReturnValueOnce(makeChain(null));
    const result = await getRecentMemos();
    expect(result).toEqual([]);
  });
});
