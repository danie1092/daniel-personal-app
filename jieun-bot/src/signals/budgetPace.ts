import type { SignalCandidate } from "./types.js";

const PACE_THRESHOLD = 1.2;

export type BudgetRow = {
  date: string;
  category: string;
  amount: number;
  type: string;
};

export function computeBudgetPace(
  rows: BudgetRow[],
  now: Date,
  monthlyBudget: number
): SignalCandidate | null {
  if (rows.length === 0) return null;

  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
  const todayStr = fmt.format(now);
  const parts = todayStr.split("-");
  const yStr = parts[0] ?? "1970";
  const mStr = parts[1] ?? "01";
  const dStr = parts[2] ?? "01";
  const y = Number(yStr);
  const m = Number(mStr);
  const monthStart = `${yStr}-${mStr}-01`;
  const daysInMonth = new Date(y, m, 0).getDate();
  const dayOfMonth = Number(dStr);

  let actual = 0;
  for (const r of rows) {
    if (r.type !== "expense") continue;
    if (r.category === "고정지출") continue;
    if (r.date < monthStart || r.date > todayStr) continue;
    actual += r.amount;
  }

  const expected = (monthlyBudget * dayOfMonth) / daysInMonth;
  if (actual < expected * PACE_THRESHOLD) return null;

  return {
    kind: "budget_pace",
    evidence: {
      actual,
      expected: Math.round(expected),
      ratio: Math.round((actual / expected) * 100) / 100,
      dayOfMonth,
      daysInMonth,
      monthlyBudget,
    },
    computed_at: now,
  };
}
