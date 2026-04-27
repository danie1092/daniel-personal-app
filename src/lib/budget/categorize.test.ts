import { describe, test, expect, vi } from "vitest";
import { lookupCategory } from "./categorize";

function mockSupabase(returnValue: { data: { category: string } | null; error: null }) {
  const maybeSingle = vi.fn().mockResolvedValue(returnValue);
  const eq2 = vi.fn().mockReturnValue({ maybeSingle });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ select });
  return { from, eq1, eq2, select } as const;
}

describe("lookupCategory", () => {
  test("hit → 사전 카테고리 반환", async () => {
    const sb = mockSupabase({ data: { category: "카페" }, error: null });
    const result = await lookupCategory({ from: sb.from } as never, "u1", "스타벅스");
    expect(result).toBe("카페");
    expect(sb.from).toHaveBeenCalledWith("merchant_category_map");
  });

  test("miss → '미분류' 반환", async () => {
    const sb = mockSupabase({ data: null, error: null });
    const result = await lookupCategory({ from: sb.from } as never, "u1", "신규가맹점");
    expect(result).toBe("미분류");
  });
});
