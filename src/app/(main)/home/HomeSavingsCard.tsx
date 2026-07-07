import Link from "next/link";
import type { SavingsOverview } from "@/lib/budget/savings";

/**
 * 홈 저축 카드 — "내가 지금까지 얼마나 모았나"를 한눈에.
 * 저축은 가계부에 '저축' 카테고리로 직접 입력한 금액의 합.
 */
export function HomeSavingsCard({ totalSaved, cycleSaved, cycleIncome, recent }: SavingsOverview) {
  const savingRate = cycleIncome > 0 ? Math.round((cycleSaved / cycleIncome) * 100) : null;
  const maxSaved = Math.max(...recent.map((r) => r.saved), 1);

  return (
    <Link
      href="/budget"
      className="block bg-surface rounded-card p-4 mb-3 border border-hair shadow-card active:opacity-80"
    >
      <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase mb-1.5">
        지금까지 모은 돈
      </div>
      <div className="text-[28px] font-extrabold tracking-tight leading-tight text-primary">
        {totalSaved.toLocaleString()}원
      </div>

      {totalSaved === 0 && cycleSaved === 0 ? (
        <div className="text-[12px] text-ink-muted mt-1">
          가계부에 🏦 저축으로 입력하면 여기에 쌓여요
        </div>
      ) : (
        <div className="text-[12px] text-ink-muted mt-0.5">
          이번달 +{cycleSaved.toLocaleString()}원
          {savingRate != null && <> · 이번달 수입의 {savingRate}%</>}
        </div>
      )}

      {/* 최근 사이클 저축 미니 바 차트 */}
      <div className="flex items-end gap-1.5 h-12 mt-3">
        {recent.map((r, i) => {
          const isCurrent = i === recent.length - 1;
          const h = r.saved > 0 ? Math.max((r.saved / maxSaved) * 100, 8) : 0;
          return (
            <div key={r.yearMonth} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full h-9 flex items-end">
                <div
                  className={`w-full rounded-t ${isCurrent ? "bg-primary" : "bg-primary/30"}`}
                  style={{ height: `${h}%`, minHeight: r.saved > 0 ? "3px" : "0" }}
                />
              </div>
              <div className={`text-[9px] ${isCurrent ? "text-primary font-bold" : "text-ink-muted"}`}>
                {Number(r.yearMonth.split("-")[1])}월
              </div>
            </div>
          );
        })}
      </div>
    </Link>
  );
}
