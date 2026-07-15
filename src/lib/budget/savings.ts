import { createClient } from "@/lib/supabase/server";
import { budgetMonthOf, budgetMonthRange, prevBudgetMonth } from "./cycle";
import { savingStreak } from "./savingsInsights";
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
  /** 저축 목표 금액 (미설정 시 null) */
  goal: number | null;
  /** 연속 저축 사이클 수 — 진행 중인 이번 사이클이 0이어도 안 깨짐 */
  streak: number;
};

export async function getSavingsOverview(recentCount = 6): Promise<SavingsOverview> {
  const supabase = await createClient();
  const cycle = budgetMonthOf(nowKST());
  const { start, end } = budgetMonthRange(cycle);

  const [{ data: savingData }, { data: incomeData }, { data: goalData }] = await Promise.all([
    supabase.from("budget_entries").select("amount, date").eq("type", "saving"),
    supabase
      .from("budget_entries")
      .select("amount")
      .eq("type", "income")
      .gte("date", start)
      .lte("date", end),
    supabase.from("savings_goal").select("target_amount").maybeSingle(),
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

  // 스트릭은 recent(6개) 너머까지 볼 수 있게 첫 저축 사이클부터 계산
  const allCycles: string[] = [cycle];
  if (savings.length > 0) {
    const earliest = savings.reduce((m, e) => (e.date < m ? e.date : m), savings[0].date);
    while (budgetMonthRange(allCycles[0]).start > earliest) {
      allCycles.unshift(prevBudgetMonth(allCycles[0]));
    }
  }
  const streak = savingStreak(
    allCycles.map((ym) => {
      const range = budgetMonthRange(ym);
      return {
        saved: savings
          .filter((e) => e.date >= range.start && e.date <= range.end)
          .reduce((s, e) => s + e.amount, 0),
      };
    })
  );

  return {
    totalSaved,
    cycleSaved: recent[recent.length - 1].saved,
    cycleIncome,
    recent,
    goal: (goalData as { target_amount: number } | null)?.target_amount ?? null,
    streak,
  };
}
