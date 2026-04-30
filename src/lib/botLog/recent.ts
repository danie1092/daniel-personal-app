import { createClient } from "@/lib/supabase/server";

export type BudgetTarget = {
  kind: "budget_entries";
  id: string;
  date: string;
  category: string;
  memo: string;
  amount: number;
  type: string;
};

export type UnknownTarget = { kind: "unknown" };

export type BotLogEntry = {
  id: string;
  written_at: string;
  user_edited_at: string | null;
  notes: string | null;
  targetTable: string;
  targetId: string;
  target: BudgetTarget | UnknownTarget;
};

export async function getRecentBotLog(days: number = 7): Promise<BotLogEntry[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();

  const { data: writes, error } = await supabase
    .from("bot_writes")
    .select("id, target_table, target_id, written_at, user_edited_at, notes")
    .gte("written_at", since)
    .order("written_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!writes) return [];

  // budget_entries 일괄 fetch (다른 테이블은 Block 4에서 추가)
  const budgetIds = writes
    .filter((w) => w.target_table === "budget_entries")
    .map((w) => w.target_id);

  const targets = new Map<string, BudgetTarget>();
  if (budgetIds.length > 0) {
    const { data: rows } = await supabase
      .from("budget_entries")
      .select("id, date, category, memo, amount, type")
      .in("id", budgetIds);
    for (const r of rows ?? []) {
      targets.set(r.id, { kind: "budget_entries", ...r } as BudgetTarget);
    }
  }

  return writes.map((w) => ({
    id: w.id,
    written_at: w.written_at,
    user_edited_at: w.user_edited_at,
    notes: w.notes,
    targetTable: w.target_table,
    targetId: w.target_id,
    target:
      w.target_table === "budget_entries" && targets.has(w.target_id)
        ? targets.get(w.target_id)!
        : ({ kind: "unknown" } as UnknownTarget),
  }));
}
