-- Adds sheet_tab dimension to sheets_sync_map. Run AFTER sheets_sync_map.sql.
-- Also clears stale budget_entries mappings (시트1 → 데이터 transition):
-- next sheetsSync run inserts fresh into the new 데이터 tab.

alter table public.sheets_sync_map
  add column if not exists sheet_tab text;

delete from public.sheets_sync_map
where source_table = 'budget_entries';
