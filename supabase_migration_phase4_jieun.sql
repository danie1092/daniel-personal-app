-- Phase 4 — 이지은 에이전트 v1 데이터 모델
-- 7개 신규 테이블 + RLS. 단일 사용자(다영)라 service_role 키 기반.

-- 1. 봇 대화 raw 로그
CREATE TABLE IF NOT EXISTS bot_conversations (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  role        text          NOT NULL CHECK (role IN ('user', 'bot', 'system')),
  content     text          NOT NULL,
  trigger     text          NOT NULL CHECK (trigger IN ('schedule', 'event', 'user', 'latent', 'system')),
  created_at  timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bot_conversations_created_at_idx
  ON bot_conversations (created_at DESC);

-- 2. daily / weekly 요약 (기억 모델)
CREATE TABLE IF NOT EXISTS daily_summary (
  date        date          PRIMARY KEY,
  summary     text          NOT NULL,
  created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weekly_summary (
  week_start  date          PRIMARY KEY,    -- 일요일
  summary     text          NOT NULL,
  created_at  timestamptz   NOT NULL DEFAULT now()
);

-- 3. 시그널 후보 + 도배 방지
CREATE TABLE IF NOT EXISTS bot_signals (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text          NOT NULL,
  evidence      jsonb         NOT NULL,
  computed_at   timestamptz   NOT NULL DEFAULT now(),
  fired_at      timestamptz,
  user_message  text
);
CREATE INDEX IF NOT EXISTS bot_signals_kind_fired_idx
  ON bot_signals (kind, fired_at DESC NULLS LAST);

-- 4. 봇 자율 기록 추적 (캘린더 등록 포함)
CREATE TABLE IF NOT EXISTS bot_writes (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table    text          NOT NULL,
  target_id       text          NOT NULL,
  conversation_id uuid          REFERENCES bot_conversations(id) ON DELETE SET NULL,
  written_at      timestamptz   NOT NULL DEFAULT now(),
  user_edited_at  timestamptz,
  notes           text
);
CREATE INDEX IF NOT EXISTS bot_writes_written_at_idx
  ON bot_writes (written_at DESC);

-- 5. 사용자 프로파일 — 봇이 다영에 대해 알게 된 것
CREATE TABLE IF NOT EXISTS user_profile (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           text          NOT NULL CHECK (kind IN ('pattern', 'preference', 'tone')),
  observation    text          NOT NULL,
  evidence_dates date[]        NOT NULL DEFAULT '{}',
  superseded_by  uuid          REFERENCES user_profile(id) ON DELETE SET NULL,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_profile_active_idx
  ON user_profile (kind, created_at DESC) WHERE superseded_by IS NULL;

-- 6. 수동 mute 상태 (단일 row)
CREATE TABLE IF NOT EXISTS bot_mute_state (
  id              int           PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  silent_until    timestamptz,
  updated_at      timestamptz   NOT NULL DEFAULT now()
);
INSERT INTO bot_mute_state (id, silent_until)
  VALUES (1, NULL) ON CONFLICT (id) DO NOTHING;

-- 7. RLS — 일반 anon/authenticated은 SELECT만, service_role(맥미니)은 풀 액세스
ALTER TABLE bot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summary     ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_summary    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_signals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_writes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profile      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_mute_state    ENABLE ROW LEVEL SECURITY;

-- 다영(authenticated)이 앱에서 봐야 함
DROP POLICY IF EXISTS "auth read" ON bot_conversations;
CREATE POLICY "auth read" ON bot_conversations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth read" ON bot_writes;
CREATE POLICY "auth read" ON bot_writes        FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth read" ON daily_summary;
CREATE POLICY "auth read" ON daily_summary     FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth read" ON user_profile;
CREATE POLICY "auth read" ON user_profile      FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth read" ON bot_mute_state;
CREATE POLICY "auth read" ON bot_mute_state    FOR SELECT TO authenticated USING (true);
-- 다영이 user_profile 라인 직접 삭제 가능 (편향 라인 제거용)
DROP POLICY IF EXISTS "auth delete" ON user_profile;
CREATE POLICY "auth delete" ON user_profile    FOR DELETE TO authenticated USING (true);
-- 다영이 mute 토글 가능 (앱에서 끄기 버튼)
DROP POLICY IF EXISTS "auth update mute" ON bot_mute_state;
CREATE POLICY "auth update mute" ON bot_mute_state
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
-- bot_signals, weekly_summary는 앱에 노출 X (디버깅 전용)
