-- supabase_migration_phase3_sms.sql

-- 1. merchant→category 사전 (사용자가 미분류 entry를 분류할 때 자동 학습됨)
CREATE TABLE IF NOT EXISTS merchant_category_map (
  user_id    uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant   text          NOT NULL,
  category   text          NOT NULL,
  updated_at timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, merchant)
);

ALTER TABLE merchant_category_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own rows" ON merchant_category_map
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. budget_entries 중복 방지 UNIQUE 제약
-- (정확히 같은 결제가 두 번 들어오는 경우는 0이라고 가정)
-- 주의: budget_entries엔 user_id 컬럼이 없음 (단일 사용자 앱).
--       멀티유저 도입 시 컬럼 추가 + 본 제약 재정의 필요.
ALTER TABLE budget_entries
  ADD CONSTRAINT budget_entries_dedup_uniq
  UNIQUE (date, amount, memo, payment_method);
