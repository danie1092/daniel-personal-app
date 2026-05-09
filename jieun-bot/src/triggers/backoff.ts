import { db } from "../db/client.js";

export type SimpleRow = { role: "user" | "bot" | "system"; created_at: string };

const BACKOFF_THRESHOLD = 3;
const BACKOFF_WINDOW_HOURS = 24;

/**
 * Pure: count bot messages from newest until we hit a user message.
 * System rows are ignored (don't break, don't count).
 * Input must be newest-first.
 */
export function countConsecutiveBotWithoutUser(rows: SimpleRow[]): number {
  let count = 0;
  for (const r of rows) {
    if (r.role === "user") break;
    if (r.role === "bot") count++;
    // system: skip
  }
  return count;
}

export async function shouldBackoff(): Promise<boolean> {
  const since = new Date(Date.now() - BACKOFF_WINDOW_HOURS * 3600 * 1000).toISOString();
  const { data, error } = await db()
    .from("bot_conversations")
    .select("role, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = (data ?? []) as SimpleRow[];
  return countConsecutiveBotWithoutUser(rows) >= BACKOFF_THRESHOLD;
}
