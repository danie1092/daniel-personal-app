/**
 * 예산 인사이트 순수 함수 모음 — 페이스 기반 코멘트, 월말 예상, 무지출 통계.
 * DB 의존 없음 → 단위테스트 용이.
 */

/**
 * 지출 코멘트. 절대 % 가 아니라 "사이클 진행률(pace) 대비 얼마나 앞서/뒤처져 있나" 기준.
 * 예: 월말(진행 90%)에 예산 80% 썼으면 잘한 것 → 잔소리 안 함.
 */
export function paceComment(spent: number, budget: number, pace: number): string {
  if (spent === 0) return "무지출 챌린지!";
  if (budget <= 0) return "";
  const ratio = spent / budget;
  if (ratio >= 1) return "예산은 넘었지만, 지금부터 아끼는 게 진짜 실력";
  const diff = ratio - pace;
  if (diff >= 0.15) return "페이스가 꽤 빨라, 이번 주는 쉬어가자";
  if (diff >= 0.05) return "조금 빠른 페이스, 금방 따라잡을 수 있어";
  if (diff >= -0.05) return "페이스 딱 좋아, 이대로만 가자";
  return "페이스보다 아끼는 중, 잘하고 있어 👏";
}

/** 현재 페이스 유지 시 사이클 말 예상 지출 (1,000원 단위 반올림). */
export function projectEndOfCycle(spent: number, daysInto: number, daysInCycle: number): number {
  if (daysInto <= 0) return spent;
  return Math.round((spent / daysInto) * daysInCycle / 1000) * 1000;
}

export type NoSpendStats = {
  /** 사이클 시작~오늘 중 지출 없는 날 수 */
  count: number;
  /** 오늘 포함 뒤에서부터 연속 무지출 일수 */
  streak: number;
};

function toDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 무지출 일수/연속 스트릭. expenseDates = 지출이 있었던 날짜(YYYY-MM-DD)들.
 * cycleStart ~ today(양끝 포함) 범위에서 계산.
 */
export function noSpendStats(
  expenseDates: Iterable<string>,
  cycleStart: string,
  today: string
): NoSpendStats {
  const spent = new Set(expenseDates);
  let count = 0;
  const cur = toDate(cycleStart);
  const end = toDate(today);
  while (cur.getTime() <= end.getTime()) {
    if (!spent.has(toStr(cur))) count++;
    cur.setDate(cur.getDate() + 1);
  }

  let streak = 0;
  const back = toDate(today);
  while (back.getTime() >= toDate(cycleStart).getTime() && !spent.has(toStr(back))) {
    streak++;
    back.setDate(back.getDate() - 1);
  }

  return { count, streak };
}
