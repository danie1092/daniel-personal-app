-- 저축·월급 엔트리는 결제수단이 없어 payment_method를 null로 저장한다.
-- 기존 NOT NULL 제약이 저장 실패("Save failed")의 원인이었으므로 해제.
ALTER TABLE budget_entries ALTER COLUMN payment_method DROP NOT NULL;
