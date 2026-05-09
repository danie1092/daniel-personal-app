-- Idempotency map for Supabase → Google Sheets sync.
-- Mirrors notion_sync_map pattern. Run in Supabase Studio SQL editor.

create table if not exists public.sheets_sync_map (
  source_table     text         not null,
  source_row_id    text         not null,
  sheet_row_index  integer      not null,
  last_synced_at   timestamptz  not null default now(),
  primary key (source_table, source_row_id)
);

create index if not exists sheets_sync_map_last_synced_at_idx
  on public.sheets_sync_map (last_synced_at);
