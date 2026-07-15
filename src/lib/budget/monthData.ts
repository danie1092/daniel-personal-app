import { createClient } from "@/lib/supabase/server";
import { budgetMonthRange, cycleDays, prevBudgetMonth } from "./cycle";
import { nowKST } from "@/lib/kst";
import { getFixedExpensesTotal } from "./fixedExpenses";
import { getBudgetOverrides, effectiveVariableBudget } from "./plans";
import { getCustomCategories, customTargetsFor } from "./customCategories";

export type BudgetEntry = {
  id: string;
  date: string;
  /** 기본 카테고리 또는 정규 전환된 커스텀 카테고리 이름 */
  category: string;
  description: string | null;
  memo: string | null;
  amount: number;
  payment_method: string | null;
  type: "income" | "saving" | "expense";
  created_at: string;
};

export type MonthSummary = {
  yearMonth: string;
  /** 총예산 (고정비 포함) — spendingWithFixed 와 같은 기준 */
  monthlyBudget: number;
  /** 변동지출 예산 (고정비 제외) — spending 과 같은 기준 */
  variableBudget: number;
  spending: number;
  spendingWithFixed: number;
  income: number;
  saving: number;
  daysInMonth: number;
  daysIntoMonth: number;
};

export type CategoryBreakdown = {
  category: string;
  amount: number;
  pct: number;
};

export async function getMonthEntries(yearMonth: string): Promise<BudgetEntry[]> {
  const supabase = await createClient();
  const { start, end } = budgetMonthRange(yearMonth);
  const { data } = await supabase
    .from("budget_entries")
    .select("id, date, category, description, memo, amount, payment_method, type, created_at")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: false });
  return (data ?? []) as BudgetEntry[];
}

export async function getMonthSummary(yearMonth: string): Promise<MonthSummary> {
  const supabase = await createClient();
  const { start, end } = budgetMonthRange(yearMonth);
  const [{ data }, fixedTotal, overrides, customs] = await Promise.all([
    supabase
      .from("budget_entries")
      .select("type, category, amount")
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: false }),
    getFixedExpensesTotal(),
    getBudgetOverrides(yearMonth),
    getCustomCategories(),
  ]);
  const variableBudget = effectiveVariableBudget(overrides, customTargetsFor(customs, yearMonth));

  const rows = (data ?? []) as { type: string; category: string; amount: number }[];

  let spending = 0;
  let spendingWithFixed = 0;
  let income = 0;
  let saving = 0;
  for (const r of rows) {
    if (r.type === "expense") {
      spendingWithFixed += r.amount;
      if (r.category !== "고정비") spending += r.amount;
    } else if (r.type === "income") income += r.amount;
    else if (r.type === "saving") saving += r.amount;
  }

  const { daysInCycle, daysIntoCycle } = cycleDays(yearMonth, nowKST());

  return {
    yearMonth,
    monthlyBudget: variableBudget + fixedTotal,
    variableBudget,
    spending,
    spendingWithFixed,
    income,
    saving,
    // "잔액(월급−지출−저축)"은 표시하지 않음 — 카드값이 한 달 뒤에 나가는 실제
    // 현금흐름과 어긋나 오해만 부른다 (사용자 결정, 2026-07-15).
    daysInMonth: daysInCycle,
    daysIntoMonth: daysIntoCycle,
  };
}

export type CycleSpending = {
  yearMonth: string;
  /** 변동지출 합 (고정비 제외 — 홈/세부내역 기준과 동일) */
  spending: number;
};

/** 최근 N개 사이클(endYearMonth 포함, 과거→현재 순)의 변동지출 합. 요약 탭 추이 차트용. */
export async function getRecentCycleSpending(
  endYearMonth: string,
  count = 6
): Promise<CycleSpending[]> {
  const cycles: string[] = [endYearMonth];
  while (cycles.length < count) cycles.unshift(prevBudgetMonth(cycles[0]));
  const ranges = cycles.map((ym) => ({ ym, ...budgetMonthRange(ym) }));

  const supabase = await createClient();
  const { data } = await supabase
    .from("budget_entries")
    .select("amount, date")
    .gte("date", ranges[0].start)
    .lte("date", ranges[ranges.length - 1].end)
    .neq("category", "고정비")
    .eq("type", "expense");

  const entries = (data ?? []) as { amount: number; date: string }[];
  return ranges.map(({ ym, start, end }) => ({
    yearMonth: ym,
    spending: entries
      .filter((e) => e.date >= start && e.date <= end)
      .reduce((s, e) => s + e.amount, 0),
  }));
}

export async function getCategoryBreakdown(yearMonth: string): Promise<CategoryBreakdown[]> {
  const entries = await getMonthEntries(yearMonth);
  const map = new Map<string, number>();
  for (const e of entries) {
    if (e.type !== "expense") continue;
    map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  }
  const total = Array.from(map.values()).reduce((s, v) => s + v, 0);
  const result: CategoryBreakdown[] = Array.from(map.entries()).map(([category, amount]) => ({
    category,
    amount,
    pct: total > 0 ? amount / total : 0,
  }));
  result.sort((a, b) => b.amount - a.amount);
  return result;
}
