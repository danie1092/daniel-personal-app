import { createClient } from "@/lib/supabase/server";
import { TOTAL_BUDGET } from "@/lib/constants";
import type { BudgetCategory } from "./categoryTokens";
import { budgetMonthRange, cycleDays } from "./cycle";

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
  monthlyBudget: number;
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
    spending,
    spendingWithFixed,
    income,
    saving,
    remaining: income - spending - saving,
    daysInMonth: daysInCycle,
    daysIntoMonth: daysIntoCycle,
  };
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
