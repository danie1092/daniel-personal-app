import { db } from "./client.js";

export type Role = "user" | "bot" | "system";
export type Trigger = "schedule" | "event" | "user" | "latent" | "system";

const VALID_ROLES: Role[] = ["user", "bot", "system"];
const VALID_TRIGGERS: Trigger[] = ["schedule", "event", "user", "latent", "system"];

export type Conversation = {
  id: string;
  role: Role;
  content: string;
  trigger: Trigger;
  created_at: string;
};

export async function saveConversation(
  role: Role,
  content: string,
  trigger: Trigger
): Promise<string> {
  if (!VALID_ROLES.includes(role)) throw new Error(`invalid role: ${role}`);
  if (!VALID_TRIGGERS.includes(trigger)) throw new Error(`invalid trigger: ${trigger}`);

  const { data, error } = await db()
    .from("bot_conversations")
    .insert({ role, content, trigger })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function recentConversations(hours: number = 24): Promise<Conversation[]> {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const { data, error } = await db()
    .from("bot_conversations")
    .select("id, role, content, trigger, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Conversation[];
}
