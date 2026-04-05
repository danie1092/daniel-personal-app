-- 기존 tamagotchi_state 테이블에 다마고치 수치 시스템 컬럼 추가
-- 기존 컬럼: id, quarter, character_type, score, stage, created_at

alter table tamagotchi_state
  add column if not exists hunger integer not null default 4,
  add column if not exists happy integer not null default 8,
  add column if not exists care_mistakes integer not null default 0,
  add column if not exists age integer not null default 0,
  add column if not exists born_at timestamptz not null default now(),
  add column if not exists last_fed timestamptz not null default now(),
  add column if not exists last_played timestamptz not null default now(),
  add column if not exists last_hunger_zero timestamptz,
  add column if not exists last_happy_zero timestamptz,
  add column if not exists play_count_today integer not null default 0,
  add column if not exists play_count_date date not null default current_date,
  add column if not exists last_routine_bonus date,
  add column if not exists last_diary_bonus date,
  add column if not exists last_visit timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists poop integer not null default 0,
  add column if not exists sick boolean not null default false;
