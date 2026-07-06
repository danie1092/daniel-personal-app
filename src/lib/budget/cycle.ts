import { BUDGET_RESET_DAY } from "@/lib/constants";

/**
 * 가계부 "한 달" = 리셋일(BUDGET_RESET_DAY) ~ 다음 리셋일 전날.
 * 사이클 라벨은 YYYY-MM (사이클이 시작하는 달). 리셋일=1이면 달력월과 동일.
 * 예) 리셋일=5 → "2026-06" 사이클 = 2026-06-05 ~ 2026-07-04.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 주어진 날짜가 속한 가계부 사이클 라벨(YYYY-MM). */
export function budgetMonthOf(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1-12
  if (d.getDate() >= BUDGET_RESET_DAY) return `${y}-${pad(m)}`;
  // 리셋일 이전이면 이전 달 사이클에 속함
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${pad(pm)}`;
}

/** 바로 이전 사이클 라벨(YYYY-MM). 연 롤오버 포함. */
export function prevBudgetMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

/** 사이클 라벨(YYYY-MM)의 [시작, 끝] 날짜(YYYY-MM-DD, 양끝 포함). */
export function budgetMonthRange(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const start = `${yearMonth}-${pad(BUDGET_RESET_DAY)}`;
  // 끝 = 다음 달 리셋일의 전날 (Date 로 안전하게 계산 — 월말/연말 롤오버)
  const endDate = new Date(y, m, BUDGET_RESET_DAY - 1); // m = 0-index 기준 "다음 달"
  return {
    start,
    end: `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`,
  };
}

/** 사이클 총 일수 + 오늘 기준 며칠째인지(과거 사이클이면 전체 일수). */
export function cycleDays(yearMonth: string, today: Date): { daysInCycle: number; daysIntoCycle: number } {
  const { start, end } = budgetMonthRange(yearMonth);
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const startMid = new Date(sy, sm - 1, sd);
  const endMid = new Date(ey, em - 1, ed);
  const MS = 86_400_000;
  const daysInCycle = Math.round((endMid.getTime() - startMid.getTime()) / MS) + 1;

  if (budgetMonthOf(today) !== yearMonth) return { daysInCycle, daysIntoCycle: daysInCycle };
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysIntoCycle = Math.round((todayMid.getTime() - startMid.getTime()) / MS) + 1;
  return { daysInCycle, daysIntoCycle };
}
