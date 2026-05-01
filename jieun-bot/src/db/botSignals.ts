import { db } from "./client.js";

export async function recordCandidate(args: {
  kind: string;
  evidence: Record<string, unknown>;
}): Promise<string> {
  const { data, error } = await db()
    .from("bot_signals")
    .insert({ kind: args.kind, evidence: args.evidence })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * 가장 최근에 발화(fired_at != null)된 시그널의 fired_at 시간.
 * dedup 룰: 24h 내 같은 kind가 발화했으면 새로 발화 안 함.
 */
export async function lastFiredAt(kind: string): Promise<Date | null> {
  const { data, error } = await db()
    .from("bot_signals")
    .select("fired_at")
    .eq("kind", kind)
    .not("fired_at", "is", null)
    .order("fired_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.fired_at) return null;
  return new Date(data.fired_at);
}

export async function markFired(id: string, userMessage: string): Promise<void> {
  const { error } = await db()
    .from("bot_signals")
    .update({ fired_at: new Date().toISOString(), user_message: userMessage })
    .eq("id", id);
  if (error) throw error;
}
