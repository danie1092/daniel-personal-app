import Link from "next/link";
import type { BudgetSummary } from "@/lib/budget/summary";
import { paceComment, projectEndOfCycle } from "@/lib/budget/insights";
import { BudgetProgressBar } from "@/components/budget/BudgetProgressBar";

export function HomeKPICard({
  monthlyBudget,
  monthSpending,
  monthSpendingWithFixed,
  todaySpending,
  daysIntoMonth,
  daysInMonth,
  prevSpendingSamePoint,
  noSpendDays,
  noSpendStreak,
  uncategorizedCount,
}: BudgetSummary) {
  const ratio = monthlyBudget > 0 ? monthSpending / monthlyBudget : 0;
  const pace = daysInMonth > 0 ? daysIntoMonth / daysInMonth : 0;
  const comment = paceComment(monthSpending, monthlyBudget, pace);

  const remaining = monthlyBudget - monthSpending;
  const daysLeft = Math.max(daysInMonth - daysIntoMonth + 1, 1);
  // 오늘 쓸 수 있는 돈: 남은 예산을 남은 일수(오늘 포함)로 나눔. 100원 단위 내림
  const dailyAllowance = Math.max(Math.floor(remaining / daysLeft / 100) * 100, 0);

  const projected = projectEndOfCycle(monthSpending, daysIntoMonth, daysInMonth);
  const projectedRatio = monthlyBudget > 0 ? projected / monthlyBudget : 0;
  // 초반 며칠은 일평균이 널뛰므로 예상치 숨김
  const showProjection = daysIntoMonth >= 3 && monthSpending > 0;

  const prevDiff =
    prevSpendingSamePoint != null ? monthSpending - prevSpendingSamePoint : null;

  return (
    <Link
      href="/budget"
      className="block bg-surface rounded-card p-4 mb-3 border border-hair shadow-card active:opacity-80"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase">
          이번달 지출
        </div>
        {uncategorizedCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold">
            미분류 {uncategorizedCount}건
          </span>
        )}
      </div>
      <div className="text-[28px] font-extrabold tracking-tight leading-tight">
        {monthSpending.toLocaleString()}원
      </div>
      <div className="text-[12px] text-ink-muted">
        / 예산 {monthlyBudget.toLocaleString()}원
        {monthSpendingWithFixed > monthSpending && (
          <> · 고정비 포함 총 {monthSpendingWithFixed.toLocaleString()}원</>
        )}
      </div>

      <div className="mt-3 mb-1.5">
        <BudgetProgressBar ratio={ratio} pace={pace} />
      </div>
      <div className="text-[12px] text-ink-sub">
        {comment} · 예산의 {Math.round(ratio * 100)}% · 한 달 {Math.round(pace * 100)}% 지남
      </div>

      <div className="mt-2 flex flex-col gap-0.5 text-[12px]">
        {showProjection && (
          <div
            className={projectedRatio > 1 ? "text-danger font-semibold" : "text-ink-muted"}
          >
            이 페이스면 월말 ~{projected.toLocaleString()}원 · 예산의{" "}
            {Math.round(projectedRatio * 100)}%
          </div>
        )}
        {prevDiff != null && (
          <div
            className={prevDiff <= 0 ? "text-success font-semibold" : "text-danger font-semibold"}
          >
            지난달 이맘때보다 {Math.abs(prevDiff).toLocaleString()}원{" "}
            {prevDiff <= 0 ? "덜 쓰는 중" : "더 쓰는 중"}
          </div>
        )}
        {noSpendDays > 0 && (
          <div className="text-ink-muted">
            무지출 {noSpendDays}일
            {noSpendStreak >= 2 && <> · 연속 {noSpendStreak}일 🔥</>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3.5 pt-3.5 border-t border-hair-light">
        <div className="text-center">
          <div className="text-[10px] text-ink-muted mb-1">오늘 지출</div>
          <div
            className={
              todaySpending > dailyAllowance && todaySpending > 0
                ? "text-[14px] font-bold text-danger"
                : "text-[14px] font-bold"
            }
          >
            {todaySpending.toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-ink-muted mb-1">하루 가능</div>
          <div className="text-[14px] font-bold text-primary">
            {dailyAllowance.toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-ink-muted mb-1">남은 예산</div>
          <div
            className={remaining < 0 ? "text-[14px] font-bold text-danger" : "text-[14px] font-bold"}
          >
            {remaining.toLocaleString()}
          </div>
        </div>
      </div>
    </Link>
  );
}
