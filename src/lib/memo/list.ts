import { createClient } from "@/lib/supabase/server";

export type MemoEntry = {
  id: string;
  content: string;
  tag: string;
  created_at: string;
};

export type CollectedItem = {
  id: string;
  url: string;
  memo: string | null;
  source: string;
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

export async function getInboxCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("collected_items")
    .select("id", { count: "exact", head: true })
    .eq("is_processed", false);
  return count ?? 0;
}

export async function getInboxItems(): Promise<CollectedItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("collected_items")
    .select("id, url, memo, source, created_at")
    .eq("is_processed", false)
    .order("created_at", { ascending: false });
  return (data ?? []) as CollectedItem[];
}
