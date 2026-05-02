import { db } from "./client.js";

export type ProfileKind = "pattern" | "preference" | "tone";

export type ProfileRow = {
  id: string;
  kind: ProfileKind;
  observation: string;
  evidence_dates: string[];
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function insertObservation(args: {
  kind: ProfileKind;
  observation: string;
  evidence_dates: string[];
}): Promise<string> {
  const { data, error } = await db()
    .from("user_profile")
    .insert({
      kind: args.kind,
      observation: args.observation,
      evidence_dates: args.evidence_dates,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function supersede(oldId: string, newId: string): Promise<void> {
  const { error } = await db()
    .from("user_profile")
    .update({ superseded_by: newId, updated_at: new Date().toISOString() })
    .eq("id", oldId);
  if (error) throw error;
}

/**
 * Active = not superseded. Newest first up to `limit`.
 */
export async function fetchActiveProfile(limit: number = 30): Promise<ProfileRow[]> {
  const { data, error } = await db()
    .from("user_profile")
    .select("id, kind, observation, evidence_dates, superseded_by, created_at, updated_at")
    .is("superseded_by", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}

export async function deleteObservation(id: string): Promise<void> {
  const { error } = await db().from("user_profile").delete().eq("id", id);
  if (error) throw error;
}
