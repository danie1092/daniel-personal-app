/**
 * 저축 게이미피케이션 순수 함수 — 마일스톤, 연속 저축 스트릭, 금액 표기.
 * DB 의존 없음 → 단위테스트 용이.
 */

/** 저축 마일스톤 단계 (원). 넘을 때마다 홈 카드에 뱃지가 올라간다. */
export const SAVING_MILESTONES = [
  1_000_000,
  3_000_000,
  5_000_000,
  10_000_000,
  20_000_000,
  30_000_000,
  50_000_000,
  100_000_000,
] as const;

export type MilestoneProgress = {
  /** 달성한 최고 마일스톤 (없으면 null) */
  reached: number | null;
  /** 다음 마일스톤 (전부 달성했으면 null) */
  next: number | null;
  /** 직전 마일스톤 → 다음 마일스톤 구간 내 진행률 0~1 (next 없으면 1) */
  pctToNext: number;
};

export function milestoneProgress(totalSaved: number): MilestoneProgress {
  let reached: number | null = null;
  let next: number | null = null;
  for (const m of SAVING_MILESTONES) {
    if (totalSaved >= m) {
      reached = m;
    } else {
      next = m;
      break;
    }
  }
  const base = reached ?? 0;
  const pctToNext = next
    ? Math.min(Math.max((totalSaved - base) / (next - base), 0), 1)
    : 1;
  return { reached, next, pctToNext };
}

/**
 * 연속 저축 사이클 수 (과거→현재 순 배열, 마지막이 현재 사이클).
 * 진행 중인 현재 사이클이 아직 0이어도 스트릭은 깨지 않는다 (이번 달에 저축할 기회가 남았으므로).
 */
export function savingStreak(cycleSavings: readonly { saved: number }[]): number {
  let i = cycleSavings.length - 1;
  if (i >= 0 && cycleSavings[i].saved === 0) i--;
  let streak = 0;
  while (i >= 0 && cycleSavings[i].saved > 0) {
    streak++;
    i--;
  }
  return streak;
}

/** 만원 단위 금액 표기 — 1,000,000 → "100만원", 150,000,000 → "1억 5,000만원" */
export function formatManwon(n: number): string {
  if (n % 10_000 !== 0) return `${n.toLocaleString()}원`;
  const eok = Math.floor(n / 100_000_000);
  const man = Math.round((n % 100_000_000) / 10_000);
  if (eok > 0) return man > 0 ? `${eok}억 ${man.toLocaleString()}만원` : `${eok}억`;
  return `${man.toLocaleString()}만원`;
}
