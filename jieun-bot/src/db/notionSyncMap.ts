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

// 노션 페이지가 archived/삭제된 경우 sync_map row를 지워서 다음 사이클에
// 새로 생성하게 만든다. 호출자가 명시적으로 결정해야 — 일반 에러에서는 삭제 X.
export async function deleteSyncMapRow(
  source_table: string,
  source_row_id: string
): Promise<void> {
  const { error } = await db()
    .from("notion_sync_map")
    .delete()
    .eq("source_table", source_table)
    .eq("source_row_id", source_row_id);
  if (error) throw error;
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
