-- Phase 2: collected_items 큐레이션 칼럼 추가
-- 적용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run
-- 롤백: ALTER TABLE collected_items DROP COLUMN summary, ... ; DROP INDEX collected_items_pending_idx, collected_items_curation_idx;

ALTER TABLE collected_items
  ADD COLUMN IF NOT EXISTS summary              text,
  ADD COLUMN IF NOT EXISTS category             text,
  ADD COLUMN IF NOT EXISTS og_title             text,
  ADD COLUMN IF NOT EXISTS og_description       text,
  ADD COLUMN IF NOT EXISTS og_image             text,
  ADD COLUMN IF NOT EXISTS processed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS processing_attempts  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error           text;

-- cron 큐 스캔용 (미처리 + 5회 미만 + 레거시 is_processed=true 제외)
CREATE INDEX IF NOT EXISTS collected_items_pending_idx
  ON collected_items (created_at ASC)
  WHERE processed_at IS NULL AND processing_attempts < 5 AND is_processed = false;

-- 큐레이션 탭 카테고리 필터용
CREATE INDEX IF NOT EXISTS collected_items_curation_idx
  ON collected_items (category, created_at DESC)
  WHERE processed_at IS NOT NULL;
