
/**
 * 카테고리별 예산 대비 실제 지출 트래커 (예산트래커.xlsx '대시보드' 시트와 동일 개념).
 * 잔소리 없이 사실만: 예산 / 지출 / 잔액 / 진행률 / 상태.
 */

export type BudgetStatus = "여유" | "주의" | "초과";

export type BudgetLine = {
  category: string;
  budget: number;
  spent: number;
  remaining: number; // 음수면 초과
  ratio: number; // spent / budget (예산 0이면 0)
  status: BudgetStatus;
};

export type BudgetTracker = {
  lines: BudgetLine[];
  /** 예산이 안 잡힌 카테고리(미분류 등)에서 쓴 합계 */
  unbudgetedSpent: number;
  totalBudget: number;
  totalSpent: number; // 예산 카테고리 지출 합
  totalRemaining: number;
};

function statusOf(ratio: number): BudgetStatus {
  if (ratio >= 1) return "초과";
  if (ratio >= 0.8) return "주의";
  return "여유";
}

/**
 * @param spentByCategory 카테고리→이번 달 지출액 (getCategoryBreakdown 결과 등)
 * @param fixedBudget 고정비 타깃 (fixed_expenses 테이블 합계)
 * @param variableTargets 그 달의 유효 변동예산 (effectiveVariableTargets — 기본값+편성 오버라이드+특별예산)
 * 예산 카테고리는 0원이라도 모두 포함, 예산 큰 순 정렬.
 * 예산에 없는 카테고리 지출(미분류 등)은 unbudgetedSpent 로 합산.
 */
export function buildBudgetTracker(
  spentByCategory: Record<string, number>,
  fixedBudget: number,
  variableTargets: Record<string, number>
): BudgetTracker {
  const targets: Record<string, number> = {
    고정비: fixedBudget,
    ...variableTargets,
  };

  const lines: BudgetLine[] = Object.keys(targets).map((category) => {
    const budget = targets[category] ?? 0;
    const spent = spentByCategory[category] ?? 0;
    const ratio = budget > 0 ? spent / budget : 0;
    return {
      category,
      budget,
      spent,
      remaining: budget - spent,
      ratio,
      status: statusOf(ratio),
    };
  });

  lines.sort((a, b) => b.budget - a.budget);

  let unbudgetedSpent = 0;
  for (const [category, amount] of Object.entries(spentByCategory)) {
    if (!(category in targets)) unbudgetedSpent += amount;
  }

  const totalSpent = lines.reduce((s, l) => s + l.spent, 0);
  const totalBudget = Object.values(targets).reduce((s, v) => s + v, 0);
  return {
    lines,
    unbudgetedSpent,
    totalBudget,
    totalSpent,
    totalRemaining: totalBudget - totalSpent,
  };
}
