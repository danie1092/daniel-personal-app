import { createClient } from "@/lib/supabase/server";
import { VARIABLE_BUDGET } from "@/lib/constants";
import { budgetMonthOf, budgetMonthRange, cycleDays, prevBudgetMonth } from "./cycle";
import { noSpendStats } from "./insights";

export type BudgetSummary = {
  /** 변동지출 예산 (고정비 제외 — 지출 합계와 같은 기준) */
  monthlyBudget: number;
  monthSpending: number;
  todaySpending: number;
  daysIntoMonth: number;
  daysInMonth: number;
  /** 지난 사이클의 같은 시점(같은 일수)까지 지출. 지난 사이클 데이터 없으면 null */
  prevSpendingSamePoint: number | null;
  noSpendDays: number;
  noSpendStreak: number;
  /** 이번 사이클 미분류 지출 건수 */
  uncategorizedCount: number;
};

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return localDateStr(new Date(y, m - 1, d + days));
}

export async function getBudgetSummary(): Promise<BudgetSummary> {
  const supabase = await createClient();
  const today = new Date();
  const todayStr = localDateStr(today);
  const cycle = budgetMonthOf(today);
  const mStart = budgetMonthRange(cycle).start;
  const { daysInCycle, daysIntoCycle } = cycleDays(cycle, today);

  // 지난 사이클, 같은 일수만큼 지난 시점까지 (사이클 끝 넘지 않게 캡)
  const prevCycle = prevBudgetMonth(cycle);
  const prevRange = budgetMonthRange(prevCycle);
  const prevPoint = addDays(prevRange.start, daysIntoCycle - 1);
  const prevEnd = prevPoint < prevRange.end ? prevPoint : prevRange.end;

  const [{ data }, { data: prevData }] = await Promise.all([
    supabase
      .from("budget_entries")
      .select("amount, date, category")
      .gte("date", mStart)
      .lte("date", todayStr)
      .neq("category", "고정비")
      .eq("type", "expense"),
    supabase
      .from("budget_entries")
      .select("amount")
      .gte("date", prevRange.start)
      .lte("date", prevEnd)
      .neq("category", "고정비")
      .eq("type", "expense"),
  ]);

  const entries = (data ?? []) as { amount: number; date: string; category: string }[];
  const monthSpending = entries.reduce((sum, e) => sum + e.amount, 0);
  const todaySpending = entries
    .filter((e) => e.date === todayStr)
    .reduce((sum, e) => sum + e.amount, 0);
  const uncategorizedCount = entries.filter((e) => e.category === "미분류").length;
  const { count: noSpendDays, streak: noSpendStreak } = noSpendStats(
    entries.map((e) => e.date),
    mStart,
    todayStr
  );

  const prevEntries = (prevData ?? []) as { amount: number }[];
  const prevSpendingSamePoint =
    prevEntries.length > 0 ? prevEntries.reduce((sum, e) => sum + e.amount, 0) : null;

  return {
    monthlyBudget: VARIABLE_BUDGET,
    monthSpending,
    todaySpending,
    daysIntoMonth: daysIntoCycle,
    daysInMonth: daysInCycle,
    prevSpendingSamePoint,
    noSpendDays,
    noSpendStreak,
    uncategorizedCount,
  };
}
