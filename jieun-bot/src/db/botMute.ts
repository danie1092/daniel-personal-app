import { db } from "./client.js";

const SINGLETON_ID = 1;

export async function isMuted(now: Date = new Date()): Promise<boolean> {
  const { data, error } = await db()
    .from("bot_mute_state")
    .select("silent_until")
    .eq("id", SINGLETON_ID)
    .single();
  if (error) throw error;
  if (!data?.silent_until) return false;
  return new Date(data.silent_until).getTime() > now.getTime();
}

export async function muteFor(hours: number): Promise<void> {
  const until = new Date(Date.now() + hours * 3600_000).toISOString();
  const { error } = await db()
    .from("bot_mute_state")
    .update({ silent_until: until, updated_at: new Date().toISOString() })
    .eq("id", SINGLETON_ID);
  if (error) throw error;
}

export async function cancelMute(): Promise<void> {
  const { error } = await db()
    .from("bot_mute_state")
    .update({ silent_until: null, updated_at: new Date().toISOString() })
    .eq("id", SINGLETON_ID);
  if (error) throw error;
}
