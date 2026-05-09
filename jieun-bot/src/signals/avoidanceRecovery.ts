import type { SignalCandidate } from "./types.js";

const MIN_GAP_DAYS = 3;

export type RoutineCheckRow = { item_id: string; date: string; checked: boolean };

function fmtKst(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
}

export function computeAvoidanceRecovery(
  checks: RoutineCheckRow[],
  now: Date
): SignalCandidate | null {
  const todayStr = fmtKst(now);

  const dates = new Map<string, Set<string>>();
  for (const c of checks) {
    if (!c.checked) continue;
    if (!dates.has(c.item_id)) dates.set(c.item_id, new Set());
    dates.get(c.item_id)!.add(c.date);
  }

  for (const [itemId, dset] of dates) {
    if (!dset.has(todayStr)) continue;
    const sorted = Array.from(dset).filter((d) => d < todayStr).sort();
    const last = sorted[sorted.length - 1];
    if (!last) continue;
    const gap = Math.floor(
      (new Date(todayStr + "T00:00:00+09:00").getTime() -
        new Date(last + "T00:00:00+09:00").getTime()) /
        (86400 * 1000)
    );
    if (gap >= MIN_GAP_DAYS) {
      return {
        kind: "avoidance_recovery",
        evidence: { itemId, gapDays: gap, lastCheckBefore: last, today: todayStr },
        computed_at: now,
      };
    }
  }
  return null;
}
