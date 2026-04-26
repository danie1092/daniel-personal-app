-- supabase_migration_phase0_rls.sql
-- 적용 시점: Phase 1 (클라이언트 supabase 직접 호출이 모두 서버 컴포넌트/API로 이전된 후)
-- 사전 점검:
--   1) docs/superpowers/specs/2026-04-26-client-supabase-usage.md 인벤토리의 모든 항목이 서버 측으로 이전되었는지
--   2) 다마고치 관련 테이블은 Phase 1에서 drop되므로 정책 생략

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
