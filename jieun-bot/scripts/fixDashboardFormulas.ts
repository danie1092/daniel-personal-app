// One-off: 다니가 손으로 정리한 대시보드 레이아웃에 맞춰 수식만 다시 박는다.
// 다니의 라벨/병합/서식/차트는 일절 건드리지 않음 — values.batchUpdate로 지정 셀의 수식만 덮어씀.

import { sheets, SHEET } from "../src/sheets/client.js";
import {
  typeSumFormula,
  categorySumFormula,
  paymentMethodSumFormula,
  reflectionLookupFormula,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
} from "../src/sheets/dashboard.js";

// 다니가 옮긴 month dropdown 위치.
const MONTH_CELL = "E1";

const heroFormula =
  `=IFERROR(VLOOKUP(${MONTH_CELL},회고!A:E,2,FALSE),0)-` +
  typeSumFormula("지출", MONTH_CELL).slice(1);

const budgetFormula = `=IFERROR(VLOOKUP(${MONTH_CELL},회고!A:E,2,FALSE),0)`;
const incomeSum = typeSumFormula("수입", MONTH_CELL);
const expenseSum = typeSumFormula("지출", MONTH_CELL);
const savingSum = typeSumFormula("저축", MONTH_CELL);
const usageFormula =
  `=IFERROR(${expenseSum.slice(1)}/IFERROR(VLOOKUP(${MONTH_CELL},회고!A:E,2,FALSE),0),0)`;

const data: { range: string; values: string[][] }[] = [
  // Hero (가용 금액)
  { range: "대시보드!C2", values: [[heroFormula]] },

  // Categories C5:C17 (13행, 다니 라벨 순서: 고정지출, 할부, 구독, 식사, 카페, 간식, 생필품, 교통, 취미, 회사, 병원, 도파민, 미분류)
  ...EXPENSE_CATEGORIES.map((cat, i) => ({
    range: `대시보드!C${5 + i}`,
    values: [[categorySumFormula(cat, MONTH_CELL)]],
  })),

  // Payment methods F5:F9 (현대카드, 우리카드, 삼성카드, 현금, 기타)
  ...PAYMENT_METHODS.map((pm, i) => ({
    range: `대시보드!F${5 + i}`,
    values: [[paymentMethodSumFormula(pm, MONTH_CELL)]],
  })),

  // 급여·카드 사용 현황 F12:F15 (월급 + 현대/우리/삼성)
  { range: "대시보드!F12", values: [[incomeSum]] },
  { range: "대시보드!F13", values: [[paymentMethodSumFormula("현대카드", MONTH_CELL)]] },
  { range: "대시보드!F14", values: [[paymentMethodSumFormula("우리카드", MONTH_CELL)]] },
  { range: "대시보드!F15", values: [[paymentMethodSumFormula("삼성카드", MONTH_CELL)]] },

  // 이번달 예산표 H 컬럼 (라벨은 H5/H7/H9/H11/H13, 값은 그 바로 아래 행)
  { range: "대시보드!H6", values: [[budgetFormula]] },   // 예산
  { range: "대시보드!H8", values: [[incomeSum]] },        // 수입
  { range: "대시보드!H10", values: [[expenseSum]] },      // 지출
  { range: "대시보드!H12", values: [[usageFormula]] },    // 사용률
  { range: "대시보드!H14", values: [[savingSum]] },       // 저축

  // 회고 K 컬럼 (라벨이 J6/J7/J8에 있으니 값은 그 옆 K6/K7/K8)
  { range: "대시보드!K6", values: [[reflectionLookupFormula(MONTH_CELL, 3)]] }, // 잘한 점
  { range: "대시보드!K7", values: [[reflectionLookupFormula(MONTH_CELL, 4)]] }, // 반성한 점
  { range: "대시보드!K8", values: [[reflectionLookupFormula(MONTH_CELL, 5)]] }, // 주요 이벤트

  // 잘못 박혀 있던 stale 수식 F21 (회고 이벤트가 결제수단 컬럼에 떨어져 있음) — 비움
  { range: "대시보드!F21", values: [[""]] },
];

await sheets().spreadsheets.values.batchUpdate({
  spreadsheetId: SHEET.budget.spreadsheetId(),
  requestBody: { valueInputOption: "USER_ENTERED", data },
});

console.log(`fix:dashboard-formulas ok — updated ${data.length} cells`);
process.exit(0);
