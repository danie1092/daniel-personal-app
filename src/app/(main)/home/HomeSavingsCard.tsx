"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SavingsOverview } from "@/lib/budget/savings";
import { milestoneProgress, formatManwon } from "@/lib/budget/savingsInsights";
import { upsertSavingsGoal } from "../budget/actions";

/**
 * 홈 저축 카드 — "내가 지금까지 얼마나 모았나"를 한눈에 + 모으는 재미.
 * 목표 진행률, 마일스톤 뱃지, 연속 저축 스트릭. 카드 탭하면 가계부로 이동.
 */
export function HomeSavingsCard({ totalSaved, cycleSaved, cycleIncome, recent, goal, streak }: SavingsOverview) {
  const router = useRouter();
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);

  const savingRate = cycleIncome > 0 ? Math.round((cycleSaved / cycleIncome) * 100) : null;
  const maxSaved = Math.max(...recent.map((r) => r.saved), 1);

  const goalPct = goal ? Math.min(totalSaved / goal, 1) : 0;
  const goalReached = goal != null && totalSaved >= goal;
  const ms = milestoneProgress(totalSaved);

  return (
    <>
      <div
        onClick={() => router.push("/budget")}
        className="block bg-surface rounded-card p-4 mb-3 border border-hair shadow-card active:opacity-80 cursor-pointer"
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase">
            지금까지 모은 돈
          </div>
          {streak >= 2 && (
            <span className="px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700 text-[10px] font-bold">
              🔥 {streak}개월 연속 저축
            </span>
          )}
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

        {/* 목표 진행률 */}
        {goal ? (
          <div className="mt-3">
            <div className="h-2 bg-hair-light rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${goalPct * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="text-[11px] text-ink-sub">
                {goalReached ? (
                  <span className="font-bold text-primary">🎉 목표 {formatManwon(goal)} 달성!</span>
                ) : (
                  <>
                    🎯 목표 {formatManwon(goal)}까지{" "}
                    <span className="font-bold">{formatManwon(goal - totalSaved)}</span> ·{" "}
                    {Math.round(goalPct * 100)}%
                  </>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setGoalSheetOpen(true);
                }}
                className="text-[10px] text-ink-muted underline underline-offset-2"
              >
                수정
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setGoalSheetOpen(true);
            }}
            className="mt-3 w-full py-2 bg-hair-light text-ink-sub rounded-input text-[12px] font-bold"
          >
            🎯 저축 목표 설정하기
          </button>
        )}

        {/* 마일스톤 — 다음 뱃지까지 */}
        {totalSaved > 0 && (
          <div className="mt-2 text-[11px] text-ink-muted">
            {ms.reached != null && <>🏅 {formatManwon(ms.reached)} 달성</>}
            {ms.next != null && (
              <>
                {ms.reached != null && " · "}다음 뱃지 {formatManwon(ms.next)}까지{" "}
                {Math.round(ms.pctToNext * 100)}%
              </>
            )}
            {ms.next == null && " · 모든 뱃지 달성 👑"}
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
      </div>

      {goalSheetOpen && (
        <SavingsGoalSheet currentGoal={goal} onClose={() => setGoalSheetOpen(false)} />
      )}
    </>
  );
}

function SavingsGoalSheet({ currentGoal, onClose }: { currentGoal: number | null; onClose: () => void }) {
  const [amount, setAmount] = useState(currentGoal ? String(currentGoal) : "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 시트 열린 동안 바닥 스크롤 잠금 (FixedExpenseSheet와 동일)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function handleSave() {
    setError(null);
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) {
      setError("금액을 정수로 입력하세요");
      return;
    }
    startTransition(async () => {
      const result = await upsertSavingsGoal(amt);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 bg-surface rounded-t-sheet flex flex-col overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hair-light">
          <h2 className="text-[16px] font-bold">저축 목표</h2>
          <button onClick={onClose} className="text-[13px] text-ink-sub">닫기</button>
        </div>

        <div className="px-4 py-3 flex flex-col gap-3">
          <div>
            <label className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase">
              목표 금액
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="예: 10000000"
              className="w-full bg-hair-light rounded-input px-3 py-2.5 text-[18px] font-bold mt-1"
            />
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {[5_000_000, 10_000_000, 20_000_000, 50_000_000].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setAmount(String(preset))}
                  className="px-2.5 py-1.5 rounded-input bg-hair-light text-ink-sub text-[12px] font-semibold"
                >
                  {formatManwon(preset)}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-[12px] text-danger">{error}</p>}
        </div>

        <div className="px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-hair-light">
          <button
            onClick={handleSave}
            disabled={pending || !amount.trim()}
            className="w-full py-2.5 bg-primary text-white rounded-input text-[13px] font-bold disabled:opacity-50"
          >
            {pending ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
