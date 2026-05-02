import { createClient } from "@/lib/supabase/server";

export type ProfileEntry = {
  id: string;
  kind: "pattern" | "preference" | "tone";
  observation: string;
  evidence_dates: string[];
  created_at: string;
};

export async function getRecentProfile(limit: number = 30): Promise<ProfileEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_profile")
    .select("id, kind, observation, evidence_dates, created_at")
    .is("superseded_by", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ProfileEntry[];
}
