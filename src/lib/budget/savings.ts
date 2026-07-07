import { createClient } from "@/lib/supabase/server";
import { budgetMonthOf, budgetMonthRange, prevBudgetMonth } from "./cycle";
import { nowKST } from "@/lib/kst";

/**
 * 홈 저축 카드용 — 저축(type='saving')은 사용자가 가계부에 직접 입력하는 값.
 * 누적 총액 + 이번 사이클 + 최근 사이클 추이를 한 번에 만든다.
 */

export type CycleSaving = { yearMonth: string; saved: number };

export type SavingsOverview = {
  /** 전체 기간 누적 저축액 */
  totalSaved: number;
  /** 이번 사이클 저축액 */
  cycleSaved: number;
  /** 이번 사이클 수입 (저축률 계산용) */
  cycleIncome: number;
  /** 최근 사이클별 저축 (과거→현재 순, 이번 사이클 포함) */
  recent: CycleSaving[];
};

export async function getSavingsOverview(recentCount = 6): Promise<SavingsOverview> {
  const supabase = await createClient();
  const cycle = budgetMonthOf(nowKST());
  const { start, end } = budgetMonthRange(cycle);

  const [{ data: savingData }, { data: incomeData }] = await Promise.all([
    supabase.from("budget_entries").select("amount, date").eq("type", "saving"),
    supabase
      .from("budget_entries")
      .select("amount")
      .eq("type", "income")
      .gte("date", start)
      .lte("date", end),
  ]);

  const savings = (savingData ?? []) as { amount: number; date: string }[];
  const totalSaved = savings.reduce((s, e) => s + e.amount, 0);

  const cycles: string[] = [cycle];
  while (cycles.length < recentCount) cycles.unshift(prevBudgetMonth(cycles[0]));
  const recent = cycles.map((ym) => {
    const range = budgetMonthRange(ym);
    return {
      yearMonth: ym,
      saved: savings
        .filter((e) => e.date >= range.start && e.date <= range.end)
        .reduce((s, e) => s + e.amount, 0),
    };
  });

  const cycleIncome = ((incomeData ?? []) as { amount: number }[]).reduce(
    (s, e) => s + e.amount,
    0
  );

  return {
    totalSaved,
    cycleSaved: recent[recent.length - 1].saved,
    cycleIncome,
    recent,
  };
}
