import type { SignalCandidate } from "./types.js";

const BREAK_THRESHOLD_DAYS = 5;
const BREAK_UPPER_DAYS = 14;  // 14일 넘으면 "회피"가 아니라 "포기" — actionable X

export type RoutineItemRow = { id: string; name: string; emoji: string };
export type RoutineCheckRow = { item_id: string; date: string; checked: boolean };

function daysBetween(dateStr: string, now: Date): number {
  const a = new Date(dateStr + "T00:00:00+09:00");
  return Math.floor((now.getTime() - a.getTime()) / (86400 * 1000));
}

export function computeRoutineStreak(
  items: RoutineItemRow[],
  checks: RoutineCheckRow[],
  now: Date
): SignalCandidate | null {
  if (items.length === 0) return null;

  const lastCheck = new Map<string, string>();
  for (const c of checks) {
    if (!c.checked) continue;
    const prev = lastCheck.get(c.item_id);
    if (!prev || c.date > prev) lastCheck.set(c.item_id, c.date);
  }

  let worst: { item: RoutineItemRow; days: number } | null = null;
  for (const item of items) {
    const last = lastCheck.get(item.id);
    if (!last) continue;
    const days = daysBetween(last, now);
    if (days < BREAK_THRESHOLD_DAYS) continue;
    if (days > BREAK_UPPER_DAYS) continue;  // 너무 오래되면 포기 — 캐묻기 X
    if (!worst || days > worst.days) worst = { item, days };
  }

  if (!worst) return null;
  return {
    kind: "routine_streak_break",
    evidence: {
      itemId: worst.item.id,
      itemName: worst.item.name,
      itemEmoji: worst.item.emoji,
      daysSinceCheck: worst.days,
    },
    computed_at: now,
  };
}
