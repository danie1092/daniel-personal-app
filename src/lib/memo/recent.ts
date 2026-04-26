import { createClient } from "@/lib/supabase/server";

export type RecentMemo = {
  id: string;
  content: string;
  tag: string;
  created_at: string;
};

export async function getRecentMemos(limit: number = 3): Promise<RecentMemo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memo_entries")
    .select("id, content, tag, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as RecentMemo[];
}
