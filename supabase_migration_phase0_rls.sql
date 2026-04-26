-- supabase_migration_phase0_rls.sql
-- 적용 시점: Phase 0 내에 즉시 적용 (Supabase Advisor Critical 경고 해소)
-- 근거: 클라이언트는 createBrowserClient로 세션 쿠키 기반 호출 → 미들웨어가 미인증을 /login으로 리다이렉트
--       → auth.uid() IS NOT NULL 정책이면 기존 클라이언트 코드 그대로 작동
-- 롤백: 각 ALTER TABLE을 DISABLE ROW LEVEL SECURITY로 바꾸거나 DROP POLICY로 제거
--
-- 적용 방법: Supabase Dashboard → SQL Editor → 이 파일 전체 붙여넣기 → Run
--
-- 사전 점검 (이미 확인됨):
--   - 다마고치 관련 테이블(tamagotchi_state)은 Phase 1에서 drop 예정이므로 정책 생략
--   - routine_entries는 0 rows 레거시 테이블 → drop

-- ── routine_entries (레거시, 0 rows, 코드 미사용) drop ─
DROP TABLE IF EXISTS routine_entries;

-- ── memo_entries ───────────────────────────────────────
ALTER TABLE memo_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all ON memo_entries;
CREATE POLICY authenticated_all ON memo_entries
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── diary_entries ──────────────────────────────────────
ALTER TABLE diary_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all ON diary_entries;
CREATE POLICY authenticated_all ON diary_entries
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── budget_entries ─────────────────────────────────────
ALTER TABLE budget_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all ON budget_entries;
CREATE POLICY authenticated_all ON budget_entries
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── salary_entries ─────────────────────────────────────
ALTER TABLE salary_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all ON salary_entries;
CREATE POLICY authenticated_all ON salary_entries
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── routine_items ──────────────────────────────────────
ALTER TABLE routine_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all ON routine_items;
CREATE POLICY authenticated_all ON routine_items
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── routine_checks ─────────────────────────────────────
ALTER TABLE routine_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all ON routine_checks;
CREATE POLICY authenticated_all ON routine_checks
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── collected_items (user_id 컬럼 존재 → 소유자 격리) ──
ALTER TABLE collected_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_only ON collected_items;
CREATE POLICY owner_only ON collected_items
  FOR ALL USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

-- service_role 키는 RLS를 우회하므로 모든 서버 라우트는 영향 없음
