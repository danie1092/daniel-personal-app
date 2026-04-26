import Link from "next/link";
import type { BudgetSummary } from "@/lib/budget/summary";

function getSpendingComment(amount: number, budget: number): string {
  if (amount === 0) return "무지출 챌린지!";
  const pct = amount / budget;
  if (pct <= 0.3) return "이번달도 아껴쓰자!";
  if (pct <= 0.6) return "슬슬 조심해야겠는걸";
  if (pct <= 0.85) return "좀만 더 아끼자...!";
  if (pct <= 1.0) return "미쳤냐?";
  return "거지가 되고싶냐?";
}

export function HomeKPICard({
  monthlyBudget,
  monthSpending,
  weekSpending,
  todaySpending,
  daysIntoMonth,
}: BudgetSummary) {
  const pct = Math.min(monthSpending / monthlyBudget, 1);
  const dailyAvg = daysIntoMonth > 0 ? Math.round(monthSpending / daysIntoMonth) : 0;
  const comment = getSpendingComment(monthSpending, monthlyBudget);

  return (
    <Link
      href="/budget"
      className="block bg-surface rounded-card p-4 mb-3 border border-hair shadow-card active:opacity-80"
    >
      <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase mb-1.5">
        이번달 지출
      </div>
      <div className="text-[28px] font-extrabold tracking-tight leading-tight">
        {monthSpending.toLocaleString()}원
      </div>
      <div className="text-[12px] text-ink-muted">
        / 예산 {monthlyBudget.toLocaleString()}원
      </div>
      <div className="h-2 bg-hair-light rounded-full mt-3 mb-1.5 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <div className="text-[12px] text-ink-sub">
        {comment} · {Math.round(pct * 100)}%
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3.5 pt-3.5 border-t border-hair-light">
        <div className="text-center">
          <div className="text-[10px] text-ink-muted mb-1">오늘</div>
          <div className="text-[14px] font-bold">{todaySpending.toLocaleString()}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-ink-muted mb-1">이번 주</div>
          <div className="text-[14px] font-bold">{weekSpending.toLocaleString()}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-ink-muted mb-1">일평균</div>
          <div className="text-[14px] font-bold">{dailyAvg.toLocaleString()}</div>
        </div>
      </div>
    </Link>
  );
}
