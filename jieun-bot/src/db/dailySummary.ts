import { db } from "./client.js";

export type DailySummary = {
  date: string;        // 'YYYY-MM-DD'
  summary: string;
  created_at: string;
};

/**
 * Insert or replace daily_summary for a date. Idempotent — re-running the
 * 23:30 job overwrites the day's summary.
 */
export async function upsertDailySummary(date: string, summary: string): Promise<void> {
  const { error } = await db()
    .from("daily_summary")
    .upsert({ date, summary }, { onConflict: "date" });
  if (error) throw error;
}

/**
 * Fetch daily summaries within [from, to] inclusive, chronological order.
 * Used by the memory loader to splice 24h~30d window into prompt.
 */
export async function fetchDailySummariesBetween(
  from: string,
  to: string
): Promise<DailySummary[]> {
  const { data, error } = await db()
    .from("daily_summary")
    .select("date, summary, created_at")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DailySummary[];
}
