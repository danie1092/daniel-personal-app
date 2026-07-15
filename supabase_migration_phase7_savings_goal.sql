-- supabase_migration_phase7_savings_goal.sql
-- 목적: 홈 저축 카드의 목표 금액 저장 (단일 행 — id는 항상 true).
-- 롤백: DROP TABLE savings_goal;

CREATE TABLE IF NOT EXISTS savings_goal (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  target_amount integer NOT NULL CHECK (target_amount > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE savings_goal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all ON savings_goal;
CREATE POLICY authenticated_all ON savings_goal
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
