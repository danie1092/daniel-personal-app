-- ── 2단계: 다마고치 성장 로직 DB 확장 ─────────────────────────────────────
-- tamagotchi_state 테이블에 새 컬럼 추가
-- Supabase SQL Editor에서 실행

ALTER TABLE tamagotchi_state
  ADD COLUMN IF NOT EXISTS happiness_score  integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS care_miss_count  integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS egg_type         text        NOT NULL DEFAULT 'smart',
  ADD COLUMN IF NOT EXISTS gender           text        NOT NULL DEFAULT 'male',
  ADD COLUMN IF NOT EXISTS teen_type        text,           -- 틴 진화시 결정, 이후 고정
  ADD COLUMN IF NOT EXISTS adult_type       text,           -- 성인 진화시 결정, 이후 고정
  ADD COLUMN IF NOT EXISTS is_sanrio        boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS living_room      text        NOT NULL DEFAULT 'kitty_living';

-- character_type은 기존 NOT NULL 유지 (egg_type으로 채워짐)
-- score 컬럼은 하위 호환 유지를 위해 남겨둠

COMMENT ON COLUMN tamagotchi_state.happiness_score  IS '베이비 기간(1-2일차) 루틴 완료율 누적 (100%=10점/일, max 20)';
COMMENT ON COLUMN tamagotchi_state.care_miss_count  IS '틴 기간(3-17일차) 루틴0%+일기미작성 합산';
COMMENT ON COLUMN tamagotchi_state.egg_type         IS 'smart | charming | creative';
COMMENT ON COLUMN tamagotchi_state.gender           IS 'male | female';
COMMENT ON COLUMN tamagotchi_state.teen_type        IS '틴 진화시 결정된 캐릭터명 (puchitomatchi 등)';
COMMENT ON COLUMN tamagotchi_state.adult_type       IS '성인 진화시 결정된 캐릭터명 (mametchi 등)';
COMMENT ON COLUMN tamagotchi_state.is_sanrio        IS '성인 진화시 20% 확률로 true';
COMMENT ON COLUMN tamagotchi_state.living_room      IS 'kitty_living | pudding_living | star_living | thunder_living';
