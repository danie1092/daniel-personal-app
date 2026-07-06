import { createClient } from "@/lib/supabase/server";
import { TOTAL_BUDGET, VARIABLE_BUDGET } from "@/lib/constants";
import type { BudgetCategory } from "./categoryTokens";
import { budgetMonthRange, cycleDays, prevBudgetMonth } from "./cycle";

const MONTHLY_BUDGET = TOTAL_BUDGET;

export type BudgetEntry = {
  id: string;
  date: string;
  category: BudgetCategory;
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
  remaining: number;
  daysInMonth: number;
  daysIntoMonth: number;
};

export type CategoryBreakdown = {
  category: BudgetCategory;
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
  const { data } = await supabase
    .from("budget_entries")
    .select("type, category, amount")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: false });

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

  const { daysInCycle, daysIntoCycle } = cycleDays(yearMonth, new Date());

  return {
    yearMonth,
    monthlyBudget: MONTHLY_BUDGET,
    variableBudget: VARIABLE_BUDGET,
    spending,
    spendingWithFixed,
    income,
    saving,
    remaining: income - spending - saving,
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
    category: category as BudgetCategory,
    amount,
    pct: total > 0 ? amount / total : 0,
  }));
  result.sort((a, b) => b.amount - a.amount);
  return result;
}
