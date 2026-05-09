import { db } from "./client.js";

export async function getSheetRowIndex(
  source_table: string,
  sheet_tab: string,
  source_row_id: string
): Promise<number | null> {
  const { data, error } = await db()
    .from("sheets_sync_map")
    .select("sheet_row_index")
    .eq("source_table", source_table)
    .eq("sheet_tab", sheet_tab)
    .eq("source_row_id", source_row_id)
    .maybeSingle();
  if (error) throw error;
  return data?.sheet_row_index ?? null;
}

export async function getIndexMap(
  source_table: string,
  sheet_tab: string,
  source_row_ids: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (source_row_ids.length === 0) return out;
  const { data, error } = await db()
    .from("sheets_sync_map")
    .select("source_row_id, sheet_row_index")
    .eq("source_table", source_table)
    .eq("sheet_tab", sheet_tab)
    .in("source_row_id", source_row_ids);
  if (error) throw error;
  for (const row of data ?? []) {
    out.set(row.source_row_id as string, row.sheet_row_index as number);
  }
  return out;
}

export async function recordSheetSync(
  source_table: string,
  sheet_tab: string,
  source_row_id: string,
  sheet_row_index: number
): Promise<void> {
  const { error } = await db()
    .from("sheets_sync_map")
    .upsert(
      {
        source_table,
        sheet_tab,
        source_row_id,
        sheet_row_index,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "source_table,source_row_id" }
    );
  if (error) throw error;
}

export async function recordSheetSyncBulk(
  rows: { source_table: string; source_row_id: string; sheet_tab: string; sheet_row_index: number }[]
): Promise<void> {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await db()
    .from("sheets_sync_map")
    .upsert(
      rows.map((r) => ({ ...r, last_synced_at: now })),
      { onConflict: "source_table,source_row_id" }
    );
  if (error) throw error;
}
