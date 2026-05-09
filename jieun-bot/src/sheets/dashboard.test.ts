import { describe, it, expect } from "vitest";
import {
  monthStartFormula,
  monthEndFormula,
  typeSumFormula,
  categorySumFormula,
  paymentMethodSumFormula,
  reflectionLookupFormula,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
} from "./dashboard.js";

const MONTH_CELL = "B1";

describe("month range formulas", () => {
  it("monthStartFormula returns DATE(year, month, 1)", () => {
    expect(monthStartFormula(MONTH_CELL)).toBe(
      `=DATE(YEAR(${MONTH_CELL}),MONTH(${MONTH_CELL}),1)`
    );
  });
  it("monthEndFormula returns EOMONTH", () => {
    expect(monthEndFormula(MONTH_CELL)).toBe(`=EOMONTH(${MONTH_CELL},0)`);
  });
});

describe("typeSumFormula", () => {
  it("filters by type and date range", () => {
    const f = typeSumFormula("지출", MONTH_CELL);
    expect(f).toContain('"지출"');
    expect(f).toContain("데이터!D:D");
    expect(f).toContain("데이터!A:A");
    expect(f).toContain('">="');
    expect(f).toContain('"<="');
    expect(f).toContain("데이터!C:C");
    expect(f.startsWith("=SUMIFS(")).toBe(true);
  });
});

describe("categorySumFormula", () => {
  it("filters by category in expense type only", () => {
    const f = categorySumFormula("식사", MONTH_CELL);
    expect(f).toContain('"식사"');
    expect(f).toContain('"지출"');
    expect(f).toContain("데이터!B:B");
  });
});

describe("paymentMethodSumFormula", () => {
  it("filters by payment_method and expense type", () => {
    const f = paymentMethodSumFormula("현대카드", MONTH_CELL);
    expect(f).toContain('"현대카드"');
    expect(f).toContain('"지출"');
    expect(f).toContain("데이터!F:F");
  });
});

describe("reflectionLookupFormula", () => {
  it("VLOOKUP from 회고 tab by month cell, returns column N", () => {
    const f = reflectionLookupFormula(MONTH_CELL, 3);
    expect(f).toBe(`=IFERROR(VLOOKUP(${MONTH_CELL},회고!A:E,3,FALSE),"")`);
  });
});

describe("category/payment lists", () => {
  it("EXPENSE_CATEGORIES has the 13 expense categories from persona", () => {
    expect(EXPENSE_CATEGORIES).toEqual([
      "고정지출", "할부", "구독", "식사", "카페", "간식",
      "생필품", "교통", "취미", "회사", "병원", "도파민", "미분류",
    ]);
  });
  it("PAYMENT_METHODS has 5 entries", () => {
    expect(PAYMENT_METHODS).toEqual(["현대카드", "우리카드", "삼성카드", "현금", "기타"]);
  });
});
