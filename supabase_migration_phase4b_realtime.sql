-- Phase 4b — 이지은 에이전트 event 트리거를 위한 Realtime publication 추가
--
-- Background:
--   Block 3a 라이브 검증 후, budget_entries INSERT가 7건+ 발생했음에도 봇의
--   event 트리거 핸들러(jieun-bot/src/triggers/event.ts)가 단 한 번도 호출되지
--   않는 현상을 발견. 원인은 hosted Supabase의 신규 테이블이 supabase_realtime
--   publication에 자동 추가되지 않는 default 동작.
--   `realtime subscribe status: SUBSCRIBED` 로그는 정상이었지만 PostgreSQL WAL이
--   해당 테이블을 broker로 흘리지 않아 클라이언트에 INSERT 이벤트가 전달 안 됨.
--
-- Fix:
--   budget_entries를 publication에 추가. DO 블록으로 idempotent하게 처리해서
--   재실행에 안전.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.budget_entries;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'budget_entries already in supabase_realtime publication — skipping';
END $$;

-- Defense-in-depth: 부팅 시 봇이 publication 멤버십을 확인할 수 있도록 헬퍼 함수.
-- supabase-js에서 db().rpc('is_table_in_publication', { ... })로 호출.
CREATE OR REPLACE FUNCTION public.is_table_in_publication(
  pub_name text,
  schema_name text,
  tbl_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = pub_name
      AND schemaname = schema_name
      AND tablename = tbl_name
  );
$$;
