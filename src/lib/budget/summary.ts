import { createClient } from "@/lib/supabase/server";
import { TOTAL_BUDGET } from "@/lib/constants";
import { budgetMonthOf, budgetMonthRange, cycleDays } from "./cycle";

const MONTHLY_BUDGET = TOTAL_BUDGET;

export type BudgetSummary = {
  monthlyBudget: number;
  monthSpending: number;
  weekSpending: number;
  todaySpending: number;
  daysIntoMonth: number;
};

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekStart(d: Date): string {
  const w = new Date(d);
  w.setDate(w.getDate() - w.getDay()); // 일요일 시작
  return localDateStr(w);
}

export async function getBudgetSummary(): Promise<BudgetSummary> {
  const supabase = await createClient();
  const today = new Date();
  const todayStr = localDateStr(today);
  const cycle = budgetMonthOf(today);
  const mStart = budgetMonthRange(cycle).start;
  const wStart = weekStart(today);

  const { data } = await supabase
    .from("budget_entries")
    .select("amount, date")
    .gte("date", mStart)
    .lte("date", todayStr)
    .neq("category", "고정비");

  const entries = (data ?? []) as { amount: number; date: string }[];
  const monthSpending = entries.reduce((sum, e) => sum + e.amount, 0);
  const weekSpending = entries
    .filter((e) => e.date >= wStart)
    .reduce((sum, e) => sum + e.amount, 0);
  const todaySpending = entries
    .filter((e) => e.date === todayStr)
    .reduce((sum, e) => sum + e.amount, 0);

  return {
    monthlyBudget: MONTHLY_BUDGET,
    monthSpending,
    weekSpending,
    todaySpending,
    daysIntoMonth: cycleDays(cycle, today).daysIntoCycle,
  };
}
