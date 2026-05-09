import type { SignalCandidate } from "./types.js";

const RATIO_THRESHOLD = 1.5;
const ABSOLUTE_THRESHOLD = 50_000;

export type BudgetRow = {
  date: string;
  category: string;
  amount: number;
  type: string;
};

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (86400 * 1000));
}

/**
 * 카테고리별 이번주 지출 vs 4주 평균. 비율 ≥1.5 AND 절대값 ≥50,000 이면 후보.
 * 고정지출은 제외 (예측 가능, actionable X).
 */
export function computeCategoryOutlier(rows: BudgetRow[], now: Date): SignalCandidate | null {
  if (rows.length === 0) return null;

  const thisWeek = new Map<string, number>();
  const prior = new Map<string, number>();

  for (const r of rows) {
    if (r.type !== "expense") continue;
    if (r.category === "고정지출") continue;
    // "미분류"는 Phase 3 SMS 자동입력의 fallback — surge가 카테고리 행동 신호가 아니라
    // 분류 미작업의 신호라 actionable X. 다영이 가계부 페이지에서 분류해야 할 일.
    if (r.category === "미분류") continue;
    const rowDate = new Date(r.date + "T00:00:00+09:00");
    const days = daysBetween(rowDate, now);
    if (days < 0 || days > 34) continue;
    if (days <= 6) thisWeek.set(r.category, (thisWeek.get(r.category) ?? 0) + r.amount);
    else if (days <= 34) prior.set(r.category, (prior.get(r.category) ?? 0) + r.amount);
  }

  let best: SignalCandidate | null = null;
  let bestRatio = 0;
  for (const [category, weekSum] of thisWeek) {
    if (weekSum < ABSOLUTE_THRESHOLD) continue;
    const priorSum = prior.get(category) ?? 0;
    const weeklyAvg = priorSum / 4;
    if (weeklyAvg === 0) continue;
    const ratio = weekSum / weeklyAvg;
    if (ratio < RATIO_THRESHOLD) continue;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = {
        kind: "category_outlier",
        evidence: {
          category,
          thisWeek: weekSum,
          weeklyAvg: Math.round(weeklyAvg),
          ratio: Math.round(ratio * 100) / 100,
        },
        computed_at: now,
      };
    }
  }
  return best;
}
