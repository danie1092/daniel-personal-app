import { createClient } from "@/lib/supabase/server";
import { BUDGET_TARGETS } from "@/lib/constants";

/**
 * 사이클별 예산 편성 (budget_plans 테이블).
 * 기본값(BUDGET_TARGETS) + 정규 커스텀 카테고리(budget_custom_categories) 위에
 * 그 달의 오버라이드를 얹어 "유효 변동예산"을 만든다.
 * 특별예산(기본에도 커스텀에도 없는 이름, 예: '부모님 생신')은 그대로 별도 줄이 된다.
 * 고정비는 fixed_expenses 테이블이 단일 소스 — 여기서 다루지 않는다.
 */

export type BudgetOverride = { category: string; amount: number };

export async function getBudgetOverrides(yearMonth: string): Promise<BudgetOverride[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("budget_plans")
    .select("category, amount")
    .eq("year_month", yearMonth);
  return (data ?? []) as BudgetOverride[];
}

/** 기본 변동예산 + 정규 커스텀 + 오버라이드 병합 (고정비 키는 무시). 순수 함수. */
export function effectiveVariableTargets(
  overrides: BudgetOverride[],
  customTargets: Record<string, number> = {}
): Record<string, number> {
  const targets: Record<string, number> = {
    ...(BUDGET_TARGETS as Record<string, number>),
    ...customTargets,
  };
  for (const o of overrides) {
    if (o.category === "고정비") continue; // 고정비는 고정비 탭에서만
    targets[o.category] = o.amount;
  }
  return targets;
}

/** 그 달의 유효 변동예산 합 */
export function effectiveVariableBudget(
  overrides: BudgetOverride[],
  customTargets: Record<string, number> = {}
): number {
  return Object.values(effectiveVariableTargets(overrides, customTargets)).reduce(
    (s, v) => s + v,
    0
  );
}
