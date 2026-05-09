import { db } from "./client.js";

export type BotWrite = {
  id: string;
  target_table: string;
  target_id: string;
  conversation_id: string | null;
  written_at: string;
  user_edited_at: string | null;
  notes: string | null;
};

export async function recordBotWrite(args: {
  targetTable: string;
  targetId: string;
  conversationId?: string | null;
  notes?: string;
}): Promise<string> {
  const { data, error } = await db()
    .from("bot_writes")
    .insert({
      target_table: args.targetTable,
      target_id: args.targetId,
      conversation_id: args.conversationId ?? null,
      notes: args.notes ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function recentBotWrites(days: number = 7): Promise<BotWrite[]> {
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const { data, error } = await db()
    .from("bot_writes")
    .select("id, target_table, target_id, conversation_id, written_at, user_edited_at, notes")
    .gte("written_at", since)
    .order("written_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as BotWrite[];
}

export async function markBotWriteEdited(id: string): Promise<void> {
  const { error } = await db()
    .from("bot_writes")
    .update({ user_edited_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
