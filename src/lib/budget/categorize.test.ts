import { describe, test, expect, vi } from "vitest";
import { lookupCategory, ruleCategory } from "./categorize";

describe("ruleCategory", () => {
  test.each([
    ["메가엠지씨커피응암이마", "카페"],
    ["응암이마트점(메가MGC커피)", "카페"], // 메가/커피가 이마트보다 먼저
    ["스타벅스 충전", "카페"],
    ["GS25응암송원", "편의점·마트·잡화"],
    ["다이소아성산업", "편의점·마트·잡화"],
    ["제로스토어응암점", "편의점·마트·잡화"],
    ["카카오T일반택시_법인", "교통"],
    ["모바일티머니선불형", "교통"],
    ["철도승차권발매", "교통"],
    ["쿠팡(쿠페이)", "쇼핑"],
    ["쿠팡이츠", "외식"], // 쿠팡이츠는 쇼핑보다 먼저 → 외식
    ["써브웨이응암점", "외식"],
    ["태양곱창신논현점", "외식"],
    ["Apple-주식회사카카오", "구독·렌탈"],
    ["ANTHROPIC", "고정비"], // Claude Max 구독은 당분간 고정지출 취급
    ["CLAUDE.AI SUBSCRIPTION", "고정비"],
    ["카페24주식회사", "구독·렌탈"], // 카페24는 카페보다 먼저 → 구독·렌탈
    ["삼성화재해상보험", "고정비"],
    ["은평탑내과의원", "의료·건강"],
    ["안국3층약국", "의료·건강"],
  ])("%s → %s", (merchant, expected) => {
    expect(ruleCategory(merchant)).toBe(expected);
  });

  test("매칭 없으면 null (긴꼬리 가맹점)", () => {
    expect(ruleCategory("콘체르토")).toBeNull();
    expect(ruleCategory("드림월드플러스")).toBeNull();
    expect(ruleCategory(null)).toBeNull();
    expect(ruleCategory("")).toBeNull();
  });
});

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
