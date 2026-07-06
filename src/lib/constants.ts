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
 * 변동지출 예산 = 총예산 - 고정비 타깃 (1,278,000).
 * 홈/세부내역의 지출 합계는 고정비를 제외하므로, "예산의 몇 %" 분모도 이걸 써야 정합.
 * (고정비 포함 기준으로 보는 곳 — 트래커/구독 탭 — 은 TOTAL_BUDGET 유지.)
 */
export const VARIABLE_BUDGET: number = TOTAL_BUDGET - (BUDGET_TARGETS.고정비 ?? 0);

/**
 * 가계부 사이클 리셋일. "한 달" = 매월 이 날 ~ 다음달 (이 날-1).
 * 1 = 달력월(1일~말일). 개인 지출 예산엔 달력월이 맞음(예산 타깃·고정비·직관 일치).
 * 사업이익 정산일 같은 회계 이벤트는 "쓸 돈 리셋"이 아니므로 여기 맞추지 않음.
 * 향후 진짜 현금흐름 사이클(예: 월급날)에 맞추고 싶으면 이 값만 바꾸면 전체 반영됨. (1~28)
 */
export const BUDGET_RESET_DAY: number = 1;

export const PAYMENT_METHODS = [
  "현대카드",
  "우리카드",
  "하나(신용)",
  "하나(체크)",
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
  // Claude Max $110 — 2026-07-06 환율 1,543원/$ 기준. 환율 오르면 갱신
  { description: "클로드 구독", amount: r(169730), paymentMethod: "현대카드" },
  { description: "가스비",   amount: r(112920), paymentMethod: "우리카드" },
  { description: "전기료",   amount: r(29410),  paymentMethod: "현금" },
  { description: "수도",     amount: r(23910),  paymentMethod: "현금" },
  { description: "코웨이",   amount: r(94279),  paymentMethod: "우리카드" },
  { description: "관리비",   amount: r(40000),  paymentMethod: "현금" },
  // 주담대는 지출이 아니라 별도 관리(자산 성격)라 고정비 목록에서 제외
] as const;
