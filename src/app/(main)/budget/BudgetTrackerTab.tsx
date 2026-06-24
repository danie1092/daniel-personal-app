import type { MonthSummary } from "@/lib/budget/monthData";
import type { BudgetTracker, BudgetStatus } from "@/lib/budget/budgetTracker";
import { CATEGORY_TOKENS, type BudgetCategory } from "@/lib/budget/categoryTokens";

type Props = {
  tracker: BudgetTracker;
  summary: MonthSummary;
};

function won(n: number): string {
  return `${n.toLocaleString()}원`;
}

const STATUS_STYLE: Record<BudgetStatus, { chip: string; bar: string }> = {
  여유: { chip: "bg-cyan-50 text-cyan-700", bar: "#0891B2" },
  주의: { chip: "bg-orange-50 text-orange-700", bar: "#EA580C" },
  초과: { chip: "bg-rose-50 text-rose-600", bar: "#E11D48" },
};

export function BudgetTrackerTab({ tracker, summary }: Props) {
  const totalRatio =
    tracker.totalBudget > 0 ? tracker.totalSpent / tracker.totalBudget : 0;
  const totalColor =
    totalRatio >= 1 ? "#E11D48" : totalRatio >= 0.85 ? "#EA580C" : "#0891B2";
  const pacePct =
    summary.daysInMonth > 0 ? summary.daysIntoMonth / summary.daysInMonth : 0;

  return (
    <div className="px-4 py-3">
      {/* 전체 요약 */}
      <div className="bg-surface rounded-card p-4 mb-3 border border-hair shadow-card">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[14px] font-bold">이번 달 예산</div>
          <div className="text-[11px] text-ink-muted">
            {summary.daysIntoMonth}/{summary.daysInMonth}일째
          </div>
        </div>
        <div className="flex items-baseline gap-1.5 mb-2">
          <span className="text-[22px] font-extrabold" style={{ color: totalColor }}>
            {won(tracker.totalSpent)}
          </span>
          <span className="text-[12px] text-ink-muted">/ {won(tracker.totalBudget)}</span>
        </div>
        <div className="relative h-2 bg-hair-light rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(totalRatio * 100, 100)}%`, backgroundColor: totalColor }}
          />
          <div
            className="absolute top-0 h-full w-px bg-ink/40"
            style={{ left: `${Math.min(pacePct * 100, 100)}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-ink-muted">
          <span>예산의 {Math.round(totalRatio * 100)}% · 한 달 {Math.round(pacePct * 100)}% 지남</span>
          <span className={tracker.totalRemaining < 0 ? "text-rose-600 font-bold" : ""}>
            남음 {won(tracker.totalRemaining)}
          </span>
        </div>
      </div>

      {/* 카테고리별 */}
      <div className="bg-surface rounded-card p-4 border border-hair shadow-card">
        <div className="text-[14px] font-bold mb-3">카테고리별 예산</div>
        <div className="flex flex-col gap-3">
          {tracker.lines.map((l) => {
            const tok =
              CATEGORY_TOKENS[l.category as BudgetCategory] ?? CATEGORY_TOKENS.미분류;
            const st = STATUS_STYLE[l.status];
            return (
              <div key={l.category}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14px]">{tok.emoji}</span>
                    <span className="text-[13px] font-semibold">{l.category}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${st.chip}`}>
                      {l.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-ink-muted">
                    {Math.round(l.ratio * 100)}%
                  </div>
                </div>
                <div className="h-1.5 bg-hair-light rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(l.ratio * 100, 100)}%`, backgroundColor: st.bar }}
                  />
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-ink-muted">
                    {won(l.spent)} / {won(l.budget)}
                  </span>
                  <span className={l.remaining < 0 ? "text-rose-600 font-semibold" : "text-ink-sub"}>
                    {l.remaining < 0 ? `${won(-l.remaining)} 초과` : `${won(l.remaining)} 남음`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {tracker.unbudgetedSpent > 0 && (
          <div className="mt-3 pt-3 border-t border-hair-light flex justify-between text-[11px] text-ink-muted">
            <span>예산 외 지출 (미분류 등)</span>
            <span className="font-semibold">{won(tracker.unbudgetedSpent)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
