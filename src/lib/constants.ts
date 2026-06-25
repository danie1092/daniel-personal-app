export const BUDGET_CATEGORIES = [
  "온라인쇼핑",
  "고정비",
  "의료·건강",
  "구독·렌탈",
  "교통",
  "카페",
  "편의점·마트·잡화",
  "외식",
  "기타기호품",
  "기타",
  "월급",
  "저축",
  "미분류",
] as const;

/** 카테고리별 월 예산 (예산트래커.xlsx 기준). 월급·저축·미분류는 예산 대상 아님. */
export const BUDGET_TARGETS: Partial<Record<(typeof BUDGET_CATEGORIES)[number], number>> = {
  온라인쇼핑: 400_000,
  고정비: 680_000,
  "의료·건강": 50_000,
  "구독·렌탈": 200_000,
  교통: 110_000,
  카페: 100_000,
  "편의점·마트·잡화": 100_000,
  외식: 90_000,
  기타기호품: 48_000,
  기타: 180_000,
};

/** 한 달 총예산 = 카테고리 예산 합 (1,958,000) */
export const TOTAL_BUDGET = Object.values(BUDGET_TARGETS).reduce(
  (a, b) => (a ?? 0) + (b ?? 0),
  0
) as number;

/**
 * 가계부 사이클 리셋일. "한 달" = 매월 이 날 ~ 다음달 (이 날-1).
 * 1이면 달력월(1일~말일)과 동일. 현재 5 = 회사 사업이익 정산일 기준.
 * 사업자 전환 등으로 사이클이 바뀌면 이 값 하나만 고치면 전체 반영됨. (1~28 권장)
 */
export const BUDGET_RESET_DAY: number = 5;

export const PAYMENT_METHODS = [
  "현대카드",
  "우리카드",
  "하나카드",
  "현금",
  "체크",
] as const;

export const MEMO_TAGS = [
  "발견",
  "놀람",
  "생각중",
  "좋아하는것",
  "나중에볼것",
] as const;

export const DIARY_EMOTIONS = [
  "😊 행복",
  "😌 평온",
  "😔 슬픔",
  "😤 화남",
  "😰 불안",
  "😴 피곤",
  "🥰 설렘",
  "😐 보통",
] as const;

function r(amount: number) {
  return Math.round(amount / 1000) * 1000;
}

export const FIXED_EXPENSES = [
  { description: "건강보험", amount: r(87595),  paymentMethod: "우리카드" },
  { description: "삼성화재", amount: r(219513), paymentMethod: "현대카드" },
  { description: "통신비",   amount: r(290151), paymentMethod: "현대카드" },
  { description: "구독",     amount: r(12663),  paymentMethod: "우리카드" },
  { description: "가스비",   amount: r(112920), paymentMethod: "우리카드" },
  { description: "전기료",   amount: r(29410),  paymentMethod: "현금" },
  { description: "수도",     amount: r(23910),  paymentMethod: "현금" },
  { description: "코웨이",   amount: r(94279),  paymentMethod: "우리카드" },
  { description: "관리비",   amount: r(40000),  paymentMethod: "현금" },
  { description: "주담대",   amount: r(400000), paymentMethod: "현금" },
] as const;
