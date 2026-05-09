import { db } from "./client.js";

export async function getNotionPageId(
  source_table: string,
  source_row_id: string
): Promise<string | null> {
  const { data, error } = await db()
    .from("notion_sync_map")
    .select("notion_page_id")
    .eq("source_table", source_table)
    .eq("source_row_id", source_row_id)
    .maybeSingle();
  if (error) throw error;
  return data?.notion_page_id ?? null;
}

export async function getRowIdByNotionPage(
  source_table: string,
  notion_page_id: string
): Promise<string | null> {
  const { data, error } = await db()
    .from("notion_sync_map")
    .select("source_row_id")
    .eq("source_table", source_table)
    .eq("notion_page_id", notion_page_id)
    .maybeSingle();
  if (error) throw error;
  return data?.source_row_id ?? null;
}

export async function recordSync(
  source_table: string,
  source_row_id: string,
  notion_page_id: string
): Promise<void> {
  const { error } = await db()
    .from("notion_sync_map")
    .upsert(
      {
        source_table,
        source_row_id,
        notion_page_id,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "source_table,source_row_id" }
    );
  if (error) throw error;
}
