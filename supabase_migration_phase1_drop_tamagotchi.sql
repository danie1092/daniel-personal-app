-- supabase_migration_phase1_drop_tamagotchi.sql
-- 적용 시점: Phase 1 코드가 main에 머지된 후 (Phase 0 RLS 적용과 동일한 패턴)
-- 사전 점검: 코드에서 tamagotchi_state 참조가 모두 제거되었는지 (Task 1 완료 후)
--
-- 적용 방법: Supabase Dashboard → SQL Editor → 이 파일 전체 붙여넣기 → Run

DROP TABLE IF EXISTS tamagotchi_state CASCADE;
