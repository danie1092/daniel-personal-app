/**
 * 예산 진행바 공용 컴포넌트 — 홈 KPI / 세부내역 / 트래커 / 구독 탭에서 공유.
 * pace(사이클 진행률)를 주면 세로 마커를 그리고, 색도 페이스 기준으로 판정.
 */

/** 진행바/금액 강조 색. 초과=danger, 페이스+5%p 이상 앞서거나 85% 이상=warning. */
export function budgetBarColor(ratio: number, pace: number | null = null): string {
  if (ratio >= 1) return "var(--color-danger)";
  if (ratio >= 0.85 || (pace != null && ratio - pace >= 0.05)) return "var(--color-warning)";
  return "var(--color-primary)";
}

type Props = {
  /** 지출/예산 (1 초과 가능 — 바는 100%에서 캡) */
  ratio: number;
  /** 사이클 진행률 0~1. null이면 마커 생략 */
  pace?: number | null;
};

export function BudgetProgressBar({ ratio, pace = null }: Props) {
  return (
    <div className="relative h-2 bg-hair-light rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${Math.min(ratio, 1) * 100}%`,
          backgroundColor: budgetBarColor(ratio, pace),
        }}
      />
      {pace != null && (
        <div
          className="absolute top-0 h-full w-px bg-ink/40"
          style={{ left: `${Math.min(pace, 1) * 100}%` }}
        />
      )}
    </div>
  );
}
