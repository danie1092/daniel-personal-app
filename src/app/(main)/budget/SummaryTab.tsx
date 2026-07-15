import type { MonthSummary, CategoryBreakdown, CycleSpending } from "@/lib/budget/monthData";
import { tokenOf } from "@/lib/budget/categoryTokens";
import { DonutChart } from "./DonutChart";
import { FixedExpenseButton } from "./FixedExpenseButton";

type Props = {
  summary: MonthSummary;
  breakdown: CategoryBreakdown[];
  trend: CycleSpending[];
};

function TrendChart({ trend, variableBudget }: { trend: CycleSpending[]; variableBudget: number }) {
  const max = Math.max(...trend.map((t) => t.spending), variableBudget, 1);
  return (
    <div className="bg-surface rounded-card p-4 mb-3 border border-hair shadow-card">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[14px] font-bold">월별 지출 추이</div>
        <div className="text-[10px] text-ink-muted">─ 예산선</div>
      </div>
      <div className="relative">
        {/* 예산선 */}
        <div
          className="absolute left-0 right-0 border-t border-dashed border-ink-muted/50"
          style={{ bottom: `${(variableBudget / max) * 72 + 26}px` }}
        />
        <div className="flex items-end justify-between gap-2">
          {trend.map((t, i) => {
            const current = i === trend.length - 1;
            const h = Math.max((t.spending / max) * 72, t.spending > 0 ? 3 : 1);
            const over = t.spending > variableBudget;
            return (
              <div key={t.yearMonth} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[9px] text-ink-muted">
                  {t.spending > 0 ? `${Math.round(t.spending / 10_000)}만` : "-"}
                </div>
                <div
                  className="w-full max-w-[28px] rounded-t-[4px]"
                  style={{
                    height: `${h}px`,
                    backgroundColor: over
                      ? "var(--color-danger)"
                      : current
                        ? "var(--color-primary)"
                        : "var(--color-hair)",
                  }}
                />
                <div className={current ? "text-[10px] font-bold" : "text-[10px] text-ink-muted"}>
                  {Number(t.yearMonth.split("-")[1])}월
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SummaryTab({ summary, breakdown, trend }: Props) {
  const maxAmount = breakdown[0]?.amount ?? 0;

  return (
    <div className="px-4 py-3">
      <div className="bg-surface rounded-card p-5 mb-3 border border-hair shadow-card">
        <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase mb-3 text-center">
          {summary.yearMonth.split("-")[1]}월 카테고리별 지출
        </div>
        <DonutChart data={breakdown} />
      </div>

      {trend.length > 1 && <TrendChart trend={trend} variableBudget={summary.variableBudget} />}

      <div className="bg-surface rounded-card p-4 mb-3 border border-hair shadow-card">
        <div className="text-[14px] font-bold mb-3">카테고리별 분포</div>
        {breakdown.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-ink-muted">데이터 없음</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {breakdown.map((b) => {
              const tok = tokenOf(b.category);
              const widthPct = maxAmount > 0 ? (b.amount / maxAmount) * 100 : 0;
              return (
                <div key={b.category}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px]">{tok.emoji}</span>
                      <span className="text-[13px] font-semibold">{b.category}</span>
                    </div>
                    <div className="text-[12px] font-bold">
                      {b.amount.toLocaleString()}원 <span className="text-ink-muted font-normal">· {Math.round(b.pct * 100)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-hair-light rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${widthPct}%`, backgroundColor: tok.hex }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-surface rounded-card p-4 mb-3 border border-hair shadow-card">
        <div className="text-[14px] font-bold mb-3">월급 / 저축</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-ink-muted mb-1">월급</div>
            <div className="text-[18px] font-extrabold text-success">
              {summary.income.toLocaleString()}원
            </div>
          </div>
          <div>
            <div className="text-[10px] text-ink-muted mb-1">저축</div>
            <div className="text-[18px] font-extrabold text-primary">
              {summary.saving.toLocaleString()}원
            </div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-hair-light">
          <div className="text-[10px] text-ink-muted mb-1">잔액 (월급 − 총지출·고정비 포함 − 저축)</div>
          <div className="text-[20px] font-extrabold">
            {summary.remaining.toLocaleString()}원
          </div>
        </div>
      </div>

      <FixedExpenseButton yearMonth={summary.yearMonth} />
    </div>
  );
}
