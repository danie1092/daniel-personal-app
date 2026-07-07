import Link from "next/link";
import { tokenOf } from "@/lib/budget/categoryTokens";
import { budgetBarColor } from "@/components/budget/BudgetProgressBar";

export type HomeCategoryLine = {
  category: string;
  spent: number;
  budget: number;
};

type Props = {
  /** 이번 사이클, 지출 많은 순 상위 카테고리 */
  lines: HomeCategoryLine[];
  /** 사이클 진행률 0~1 — 바 색 판정 + 마커 */
  pace: number;
  month: number;
};

/** 홈 카테고리 현황 — "어디서 많이 썼고 어디를 조여야 하나" 미니 트래커 */
export function HomeCategoryCard({ lines, pace, month }: Props) {
  if (lines.length === 0) return null;

  return (
    <Link
      href="/budget?tab=tracker"
      className="block bg-surface rounded-card p-4 mb-3 border border-hair shadow-card active:opacity-80"
    >
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase">
          {month}월 많이 쓴 카테고리
        </div>
        <span className="text-[11px] text-ink-sub">트래커 →</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {lines.map((l) => {
          const tok = tokenOf(l.category);
          const ratio = l.budget > 0 ? l.spent / l.budget : 0;
          const over = l.spent > l.budget;
          return (
            <div key={l.category}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[13px]">{tok.emoji}</span>
                  <span className="text-[12px] font-semibold truncate">{l.category}</span>
                </div>
                <div className="text-[11px] shrink-0 ml-2">
                  <span className={over ? "font-bold text-danger" : "font-bold"}>
                    {l.spent.toLocaleString()}
                  </span>
                  <span className="text-ink-muted"> / {l.budget.toLocaleString()}</span>
                </div>
              </div>
              <div className="relative h-1.5 bg-hair-light rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(ratio, 1) * 100}%`,
                    backgroundColor: budgetBarColor(ratio, pace),
                  }}
                />
                <div
                  className="absolute top-0 h-full w-px bg-ink/30"
                  style={{ left: `${Math.min(pace, 1) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Link>
  );
}
