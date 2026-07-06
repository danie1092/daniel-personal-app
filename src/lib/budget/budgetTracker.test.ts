import { describe, test, expect } from "vitest";
import { buildBudgetTracker } from "./budgetTracker";

describe("buildBudgetTracker", () => {
  test("예산 카테고리는 0원이라도 모두 포함하고 예산 큰 순 정렬", () => {
    const t = buildBudgetTracker({ 외식: 30_000 });
    // 고정비(68만)가 첫 줄
    expect(t.lines[0].category).toBe("고정비");
    // 예산 10개 카테고리 전부 포함
    expect(t.lines).toHaveLength(10);
    const 외식 = t.lines.find((l) => l.category === "외식")!;
    expect(외식.spent).toBe(30_000);
    expect(외식.remaining).toBe(60_000); // 90,000 - 30,000
  });

  test("상태: 여유<80% ≤주의<100% ≤초과", () => {
    const t = buildBudgetTracker({ 카페: 50_000, 외식: 80_000, 교통: 120_000 });
    expect(t.lines.find((l) => l.category === "카페")!.status).toBe("여유"); // 50/100
    expect(t.lines.find((l) => l.category === "외식")!.status).toBe("주의"); // 80/90 ≈ 0.89
    expect(t.lines.find((l) => l.category === "교통")!.status).toBe("초과"); // 120/110
  });

  test("예산 없는 카테고리(미분류 등) 지출은 unbudgetedSpent 로", () => {
    const t = buildBudgetTracker({ 미분류: 25_000, 외식: 10_000 });
    expect(t.unbudgetedSpent).toBe(25_000);
    expect(t.totalSpent).toBe(10_000); // 예산 카테고리 지출만
  });

  test("총예산 = 2,259,000 (변동 1,178,000 + 고정비 목록 합 1,081,000)", () => {
    const t = buildBudgetTracker({});
    expect(t.totalBudget).toBe(2_259_000);
    expect(t.totalRemaining).toBe(2_259_000);
  });

  test("초과 시 remaining 음수", () => {
    const t = buildBudgetTracker({ 외식: 100_000 });
    const 외식 = t.lines.find((l) => l.category === "외식")!;
    expect(외식.remaining).toBe(-10_000);
    expect(외식.status).toBe("초과");
  });
});
