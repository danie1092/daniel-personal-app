import { createClient } from "@/lib/supabase/server";

export type MemoEntry = {
  id: string;
  content: string;
  tag: string;
  created_at: string;
};

export async function getAllMemos(): Promise<MemoEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memo_entries")
    .select("id, content, tag, created_at")
    .order("created_at", { ascending: false });
  return (data ?? []) as MemoEntry[];
}
