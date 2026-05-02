// jieun-bot/src/db/weeklySummary.ts (stub — full impl in Task 4b.4/4b.5)
import { db } from "./client.js";

export type WeeklySummary = {
  week_start: string;
  summary: string;
  created_at: string;
};

export async function fetchWeeklySummariesBetween(
  from: string,
  to: string
): Promise<WeeklySummary[]> {
  const { data, error } = await db()
    .from("weekly_summary")
    .select("week_start, summary, created_at")
    .gte("week_start", from)
    .lte("week_start", to)
    .order("week_start", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WeeklySummary[];
}
