import { db } from "../db/client.js";
import { computeCategoryOutlier } from "./categoryOutlier.js";
import { computeBudgetPace } from "./budgetPace.js";
import { computeRoutineStreak } from "./routineStreak.js";
import { computeAvoidanceRecovery } from "./avoidanceRecovery.js";
import { computeMemoFrequency } from "./memoFrequency.js";
import { lastFiredAt } from "../db/botSignals.js";
import type { SignalCandidate } from "./types.js";

const MONTHLY_BUDGET = 2_000_000;
const DEDUP_HOURS = 24;

/**
 * Fetch 60-day data + run all 5 signals + apply 24h dedup.
 * Returns candidates that should fire (not yet fired in last 24h).
 */
export async function computeSignals(now: Date = new Date()): Promise<SignalCandidate[]> {
  const sixtyAgo = new Date(now.getTime() - 60 * 86400 * 1000).toISOString().slice(0, 10);

  const [budgetRes, itemsRes, checksRes, memoRes] = await Promise.all([
    db().from("budget_entries").select("date, category, amount, type").gte("date", sixtyAgo),
    db().from("routine_items").select("id, name, emoji"),
    db().from("routine_checks").select("item_id, date, checked").gte("date", sixtyAgo),
    db().from("memo_entries").select("created_at").gte("created_at", sixtyAgo),
  ]);

  const budgetRows = (budgetRes.data ?? []) as { date: string; category: string; amount: number; type: string }[];
  const items = (itemsRes.data ?? []) as { id: string; name: string; emoji: string }[];
  const checks = (checksRes.data ?? []) as { item_id: string; date: string; checked: boolean }[];
  const memos = (memoRes.data ?? []) as { created_at: string }[];

  const allCandidates: (SignalCandidate | null)[] = [
    computeCategoryOutlier(budgetRows, now),
    computeBudgetPace(budgetRows, now, MONTHLY_BUDGET),
    computeRoutineStreak(items, checks, now),
    computeAvoidanceRecovery(checks, now),
    computeMemoFrequency(memos, now),
  ];

  // 24h dedup
  const dedupCutoff = now.getTime() - DEDUP_HOURS * 3600 * 1000;
  const passed: SignalCandidate[] = [];
  for (const c of allCandidates) {
    if (!c) continue;
    const last = await lastFiredAt(c.kind);
    if (last && last.getTime() > dedupCutoff) continue;
    passed.push(c);
  }
  return passed;
}
