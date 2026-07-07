import type { MonthSummary } from "@/lib/budget/monthData";
import type { Subscription } from "@/lib/budget/subscriptions";
import { tokenOf } from "@/lib/budget/categoryTokens";
import { BudgetProgressBar, budgetBarColor } from "@/components/budget/BudgetProgressBar";
import { SubscriptionDeleteButton } from "./SubscriptionDeleteButton";

type Props = {
  subs: Subscription[];
  monthlyTotal: number;
  summary: MonthSummary;
};

function won(n: number): string {
  return `${n.toLocaleString()}원`;
}

export function SubscriptionsTab({ subs, monthlyTotal, summary }: Props) {
  // 예산 진행률 (사실만, 잔소리 X)
  const spent = summary.spendingWithFixed;
  const pct = summary.monthlyBudget > 0 ? spent / summary.monthlyBudget : 0;
  const pacePct = summary.daysInMonth > 0 ? summary.daysIntoMonth / summary.daysInMonth : 0;
  const barColor = budgetBarColor(pct, pacePct);

  return (
    <div className="px-4 py-3">
      {/* 이번 달 예산 진행률 — 보여주기만 */}
      <div className="bg-surface rounded-card p-4 mb-3 border border-hair shadow-card">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[14px] font-bold">이번 달 예산</div>
          <div className="text-[11px] text-ink-muted">
            {summary.daysIntoMonth}/{summary.daysInMonth}일째
          </div>
        </div>
        <div className="flex items-baseline gap-1.5 mb-2">
          <span className="text-[22px] font-extrabold" style={{ color: barColor }}>
            {won(spent)}
          </span>
          <span className="text-[12px] text-ink-muted">/ {won(summary.monthlyBudget)}</span>
        </div>
        {/* 오늘 페이스 마커: 이 위치보다 막대가 길면 평소보다 빠른 지출 */}
        <BudgetProgressBar ratio={pct} pace={pacePct} />
        <div className="mt-1.5 text-[11px] text-ink-muted">
          예산의 {Math.round(pct * 100)}% · 한 달 {Math.round(pacePct * 100)}% 지남
        </div>
      </div>

      {/* 구독·고정지출 */}
      <div className="bg-surface rounded-card p-4 border border-hair shadow-card">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[14px] font-bold">구독 · 고정지출</div>
          <div className="text-[12px] font-bold text-primary">매달 {won(monthlyTotal)}</div>
        </div>
        <div className="text-[11px] text-ink-muted mb-3">
          최근 결제에서 매달 반복되는 것만 자동으로 모았어
        </div>

        {subs.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-ink-muted">
            아직 반복 결제가 안 잡혔어.
            <br />
            몇 달 쌓이면 여기 구독·고정지출이 모여.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {subs.map((s, i) => {
              const tok = tokenOf(s.category);
              return (
                <div
                  key={`${s.name}-${i}`}
                  className="flex items-center gap-3 py-2 border-b border-hair-light last:border-0"
                >
                  <span className="text-[18px]">{tok.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-semibold truncate">{s.name}</span>
                      {s.isNew && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[9px] font-bold">
                          NEW
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-ink-muted">
                      {s.cadence === "monthly" ? "매달" : "가끔"} · {s.months.length}개월 관측
                      {" · "}
                      {s.lastDate.slice(5).replace("-", "/")} 최근
                    </div>
                  </div>
                  <div className="text-[13px] font-bold shrink-0">{won(s.typicalAmount)}</div>
                  <SubscriptionDeleteButton merchantKey={s.key} name={s.name} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
