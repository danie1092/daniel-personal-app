-- 루틴 트래킹 + 컨디션 기록.
-- 1) daily_log: 하루 1행, score(1~5) + free text. 같은 date면 UPSERT.
-- 2) routine_items.time_slot: 노션 시간대 select(아침/낮/저녁) → DB 텍스트.
-- Run in Supabase Studio SQL editor.

create table if not exists public.daily_log (
  date           date         primary key,
  sleep_score    smallint,
  sleep_text     text,
  mood_score     smallint,
  mood_text      text,
  energy_score   smallint,
  energy_text    text,
  breakfast      text,
  lunch          text,
  dinner         text,
  updated_at     timestamptz  not null default now()
);

create index if not exists daily_log_date_idx on public.daily_log (date desc);

alter table public.routine_items
  add column if not exists time_slot text;

create index if not exists routine_items_time_slot_idx on public.routine_items (time_slot);
