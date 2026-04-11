-- 가계부: 지출 기록
create table budget_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  category text not null,
  description text,
  amount integer not null,
  payment_method text not null,
  created_at timestamptz default now()
);

-- 가계부: 월급 기록
create table salary_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  amount integer not null,
  created_at timestamptz default now()
);

-- 일기
create table diary_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  content text not null,
  emotion text,
  created_at timestamptz default now()
);

-- 메모
create table memo_entries (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  tag text not null,
  created_at timestamptz default now()
);

-- 루틴 (레거시, 더 이상 사용 안 함)
-- create table routine_entries ...

-- 루틴 항목 설정
create table routine_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null default '✅',
  sort_order integer not null default 0,
  pokemon_id integer,
  level integer not null default 1,
  exp integer not null default 0,
  created_at timestamptz default now()
);

-- 루틴 체크 기록
create table routine_checks (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references routine_items(id) on delete cascade,
  date date not null,
  checked boolean not null default true,
  unique(item_id, date)
);

-- 다마고치 상태
create table tamagotchi_state (
  id uuid primary key default gen_random_uuid(),
  quarter text not null unique,
  character_type text not null,
  score integer not null default 0,
  stage text not null default 'egg',
  created_at timestamptz default now()
);
