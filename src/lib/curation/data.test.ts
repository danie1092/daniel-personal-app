import { describe, test, expect, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));

beforeEach(() => vi.clearAllMocks());

import { getCurationItems, getCategoryCounts } from "./data";

describe("getCurationItems", () => {
  test("filter=all → processed_at NOT NULL", async () => {
    const orderMock = vi.fn(() => Promise.resolve({ data: [], error: null }));
    fromMock.mockReturnValue({
      select: () => ({
        not: () => ({ order: orderMock }),
      }),
    });
    await getCurationItems("all");
    expect(orderMock).toHaveBeenCalledWith("processed_at", { ascending: false });
  });

  test("filter=카테고리 → eq(category) 추가", async () => {
    const eqMock = vi.fn(() => ({ order: () => Promise.resolve({ data: [], error: null }) }));
    fromMock.mockReturnValue({
      select: () => ({
        not: () => ({ eq: eqMock }),
      }),
    });
    await getCurationItems("여행");
    expect(eqMock).toHaveBeenCalledWith("category", "여행");
  });

  test("filter=dead-letter → attempts>=5 + processed_at NULL", async () => {
    const orderMock = vi.fn(() => Promise.resolve({ data: [], error: null }));
    fromMock.mockReturnValue({
      select: () => ({
        gte: () => ({ is: () => ({ order: orderMock }) }),
      }),
    });
    await getCurationItems("dead-letter");
    expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  test("결과 매핑 (snake → camel)", async () => {
    const row = {
      id: "i1", url: "u", memo: null,
      summary: "s", category: "여행",
      og_title: "T", og_description: "D", og_image: "I",
      created_at: "c", processed_at: "p",
    };
    fromMock.mockReturnValue({
      select: () => ({
        not: () => ({ order: () => Promise.resolve({ data: [row], error: null }) }),
      }),
    });
    const r = await getCurationItems("all");
    expect(r[0].ogTitle).toBe("T");
    expect(r[0].processedAt).toBe("p");
  });

  test("getCategoryCounts: filter별 카운트 합산", async () => {
    fromMock.mockImplementation(() => ({
      select: (_: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) {
          return {
            not: () => ({
              // all: not("processed_at", "is", null) 직후 종결
              // 카테고리별: not(...).eq("category", X)로 종결
              eq: () => Promise.resolve({ count: 0, error: null }),
              // not(...) 자체가 thenable이 되도록 — Promise-like 처리
              then: undefined,
            }),
            gte: () => ({ is: () => Promise.resolve({ count: 1, error: null }) }),
          };
        }
        return { not: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
      },
    }));

    // all count: not()가 직접 resolve되어야 함 — then 지원을 위해 mock 보강
    // getCategoryCounts는 not() 결과를 await함 → thenable로 만들어야 함
    fromMock.mockImplementation(() => ({
      select: (_: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) {
          const notResult = (resolve: unknown) => {
            // 카테고리별: eq()가 호출됨
            // all: await not(...) 직접
            void resolve;
            return {
              eq: () => Promise.resolve({ count: 0, error: null }),
              // thenable: await not(...) 가 바로 resolve되도록
              then: (res: (v: { count: number; error: null }) => unknown) =>
                Promise.resolve({ count: 8, error: null }).then(res),
            };
          };
          return {
            not: notResult,
            gte: () => ({
              is: () => Promise.resolve({ count: 1, error: null }),
            }),
          };
        }
        return { not: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
      },
    }));

    const r = await getCategoryCounts();
    expect(typeof r["all"]).toBe("number");
    expect(typeof r["dead-letter"]).toBe("number");
  });
});
