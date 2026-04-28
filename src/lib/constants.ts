export const BUDGET_CATEGORIES = [
  "고정지출",
  "할부",
  "구독",
  "식사",
  "카페",
  "간식",
  "생필품",
  "교통",
  "취미",
  "회사",
  "병원",
  "도파민",
  "월급",
  "저축",
  "미분류",
] as const;

export const PAYMENT_METHODS = [
  "현대카드",
  "우리카드",
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

export const ROUTINE_ITEMS = [
  { id: "wake", label: "기상" },
  { id: "meal1", label: "식사 1끼" },
  { id: "meal2", label: "식사 2끼" },
  { id: "supplement", label: "영양제" },
  { id: "relax", label: "여유" },
  { id: "exercise", label: "운동" },
] as const;

export const ROUTINE_LEVELS = [50, 70, 100] as const;

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
