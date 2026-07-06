import type { SupabaseClient } from "@supabase/supabase-js";
import { BUDGET_CATEGORIES } from "@/lib/constants";
import type { BudgetCategory } from "./categoryTokens";

/**
 * 가맹점(memo) 키워드 → 카테고리 규칙. **위에서부터 먼저 매칭**(우선순위 순서가 중요).
 * 카드 SMS의 가맹점명이 잘리고 지저분해서(예: "메가엠지씨커피응암이마") 정확일치 대신
 * 부분문자열(소문자) 매칭한다. 다니의 실제 거래 패턴에서 도출.
 *
 * 순서 주의:
 * - "카페24"(웹호스팅)는 카페보다 먼저 → 구독·렌탈로.
 * - "쿠팡이츠"(배달)는 온라인쇼핑("쿠팡")보다 먼저 → 외식으로.
 */
export const CATEGORY_RULES: { category: BudgetCategory; keywords: string[] }[] = [
  // anthropic/claude는 당분간 고정지출(Max 구독 $110)로 취급 — 구독·렌탈 예산(20만)이 못 담는 크기
  { category: "고정비", keywords: ["삼성화재", "보험", "헬스장 할부", "anthropic", "claude"] },
  { category: "의료·건강", keywords: ["의원", "약국", "병원", "내과", "치과", "한의원", "건강의학", "정신건강"] },
  { category: "교통", keywords: ["택시", "티머니", "카카오t", "철도", "지하철", "버스", "모빌리티"] },
  { category: "구독·렌탈", keywords: ["카페24", "구글페이먼트", "googleplay", "google", "netflix", "넷플릭스", "youtube", "유튜브", "apple", "애플", "spotify", "스포티파이"] },
  { category: "외식", keywords: ["쿠팡이츠", "배달의민족", "배민", "요기요", "써브웨이", "subway", "곱창", "한우", "면옥", "국수", "김밥", "분식", "식당", "치킨", "라면", "스시", "초밥", "순대", "버거", "피자", "떡볶이", "횟집", "냠냠", "호로록"] },
  { category: "온라인쇼핑", keywords: ["쿠팡", "무신사", "크림", "kream", "11번가", "지마켓", "g마켓", "ssg", "옥션", "agoda", "아고다", "에이블리", "지그재그"] },
  { category: "카페", keywords: ["커피", "coffee", "메가", "mgc", "엠지씨", "스타벅스", "starbucks", "베이커리", "베이커스", "빵", "배스킨라빈스", "배스킨", "카페"] },
  { category: "편의점·마트·잡화", keywords: ["gs25", "cu", "세븐일레븐", "이마트", "다이소", "제로스토어", "아트박스", "마트", "편의점", "올리브영"] },
];

/** memo(가맹점) 문자열을 키워드 규칙으로 분류. 매칭 없으면 null. */
export function ruleCategory(merchant: string | null | undefined): BudgetCategory | null {
  if (!merchant) return null;
  const m = merchant.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => m.includes(k.toLowerCase()))) return rule.category;
  }
  return null;
}

/**
 * 카테고리 결정 우선순위:
 * 1) 사용자가 직접 학습시킨 정확일치 매핑(merchant_category_map)
 * 2) 키워드 규칙(ruleCategory)
 * 3) 둘 다 미스 → "미분류" (사용자가 한번 고치면 1)에 학습됨)
 */
export async function lookupCategory(
  supabase: SupabaseClient,
  userId: string,
  merchant: string
): Promise<string> {
  const { data } = await supabase
    .from("merchant_category_map")
    .select("category")
    .eq("user_id", userId)
    .eq("merchant", merchant)
    .maybeSingle();

  const mapped = (data as { category: string } | null)?.category;
  if (mapped && BUDGET_CATEGORIES.includes(mapped as BudgetCategory)) return mapped;

  const ruled = ruleCategory(merchant);
  if (ruled) return ruled;

  return "미분류";
}
