// 지출 카테고리 — 페르소나 정의 (월급/저축 제외, 13종).
export const EXPENSE_CATEGORIES = [
  "고정지출", "할부", "구독", "식사", "카페", "간식",
  "생필품", "교통", "취미", "회사", "병원", "도파민", "미분류",
] as const;

// 결제수단 — 봇이 자주 쓰는 값 + "기타" fallback.
export const PAYMENT_METHODS = [
  "현대카드", "우리카드", "삼성카드", "현금", "기타",
] as const;

// 데이터 탭 컬럼:
//   A=날짜, B=카테고리, C=금액, D=유형, E=메모, F=결제수단

export function monthStartFormula(monthCell: string): string {
  return `=DATE(YEAR(${monthCell}),MONTH(${monthCell}),1)`;
}

export function monthEndFormula(monthCell: string): string {
  return `=EOMONTH(${monthCell},0)`;
}

// 한 type (지출/수입/저축)의 합.
export function typeSumFormula(typeKr: string, monthCell: string): string {
  const start = `DATE(YEAR(${monthCell}),MONTH(${monthCell}),1)`;
  const end = `EOMONTH(${monthCell},0)`;
  return `=SUMIFS(데이터!C:C,데이터!D:D,"${typeKr}",데이터!A:A,">="&${start},데이터!A:A,"<="&${end})`;
}

// 한 지출 카테고리의 합 (지출 type 한정).
export function categorySumFormula(category: string, monthCell: string): string {
  const start = `DATE(YEAR(${monthCell}),MONTH(${monthCell}),1)`;
  const end = `EOMONTH(${monthCell},0)`;
  return `=SUMIFS(데이터!C:C,데이터!B:B,"${category}",데이터!D:D,"지출",데이터!A:A,">="&${start},데이터!A:A,"<="&${end})`;
}

// 한 결제수단의 지출 합.
export function paymentMethodSumFormula(method: string, monthCell: string): string {
  const start = `DATE(YEAR(${monthCell}),MONTH(${monthCell}),1)`;
  const end = `EOMONTH(${monthCell},0)`;
  return `=SUMIFS(데이터!C:C,데이터!F:F,"${method}",데이터!D:D,"지출",데이터!A:A,">="&${start},데이터!A:A,"<="&${end})`;
}

// 회고 탭에서 해당 월의 N번째 컬럼 값 (2=예산, 3=잘한 점, 4=반성한 점, 5=주요 이벤트).
export function reflectionLookupFormula(monthCell: string, columnIndex: number): string {
  return `=IFERROR(VLOOKUP(${monthCell},회고!A:E,${columnIndex},FALSE),"")`;
}
