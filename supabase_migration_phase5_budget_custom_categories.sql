-- supabase_migration_phase5_budget_custom_categories.sql
-- 적용 완료: 2026-07-07 (Supabase MCP apply_migration: phase5_budget_custom_categories)
-- 목적: 예산 편성의 특별예산을 "정규(매월 반복)" 카테고리로 전환하는 기능.
--   - 특별예산은 budget_plans 에 그 달(year_month)에만 존재 → 매월 다시 추가해야 함
--   - 정규 전환하면 이 테이블에 들어가고, effective_from 사이클부터 매달 예산에 자동 포함
--   - 지출 입력의 카테고리 선택지에도 추가됨 (예: 외식과 분리한 '식료품')
-- 롤백: DROP TABLE budget_custom_categories;

CREATE TABLE IF NOT EXISTS budget_custom_categories (
  name text PRIMARY KEY,
  amount integer NOT NULL CHECK (amount >= 0),
  -- 이 사이클(YYYY-MM)부터 예산에 포함 (당월 예산 잠금 원칙 유지)
  effective_from text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE budget_custom_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all ON budget_custom_categories;
CREATE POLICY authenticated_all ON budget_custom_categories
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
