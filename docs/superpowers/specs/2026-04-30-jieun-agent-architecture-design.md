# 이지은 — 에이전트-퍼스트 개인앱 아키텍처

- **작성일**: 2026-04-30
- **상태**: Draft (사용자 컨펌 후 작성)
- **선행 조건**: Phase 3 (SMS 가계부 자동화 — 맥미니 always-on 환경 + chat.db 패턴), Phase 1.5 (가계부/메모/일기/루틴 리노베이션 — Server Components + 13개 카테고리)
- **후속**: 본 spec은 v1 골격만 정의한다. v2 메뉴 추천(생리주기/월간 패턴), v2 캘린더 쓰기는 별도 spec.

## 배경

현재 개인앱은 **자기 입력형 데드드롭** — 사용자가 직접 들어가서 입력하고 닫는 흐름이다. 가계부, 메모, 큐레이션, 일기, 루틴이 다 잘 정비됐지만 활용도가 낮다. 사용자의 업무가 산발적이고 급한 처리/선택이 많아서 *능동적으로 앱에 접근*하는 동작 자체가 부담이 되기 때문.

대조: 사용자가 잘 쓰는 **지점앱**은 반대편에 팀장이 있어서 입력하지 않으면 시스템이 굴러가지 않는다. 이게 입력을 끌어내는 구조적 장치다.

해법: **반대편에 누군가가 있게 만든다.** 텔레그램에서 사용자에게 먼저 말 거는 에이전트를 둔다. 앱 안의 기능 추가가 아니라, *반대편의 존재*를 만드는 일이다.

영감: 인스타그램 [@eunjibak.1](https://www.instagram.com/eunjibak.1/)의 회고봇(금동이) 시리즈. 핵심 원칙 5개:
1. 침묵의 설계가 발화 설계보다 먼저
2. 판단 X, 관찰 O ("좋은 흐름", "막히는 흐름" — 점수 X)
3. 판단할 땐 반드시 근거와 함께 (블랙박스 회피)
4. 회피↔실행 패턴이 진짜 추적 대상
5. 안 한 날엔 분석 X, 격려

## 목표 (v1)

1. **반대편 존재 만들기**: 텔레그램에서 *사용자에게 먼저* 말 거는 봇이 항상 떠 있다. 침묵이 기본이고 발화는 가치 있을 때만.
2. **하루 리듬 잡아주기**: 아침·점심·퇴근직전·퇴근·회고 5개 시간대에 봇이 가벼운 노크 / 브리핑 / 회고 대화를 진행한다.
3. **자율 데이터 기록**: 사용자가 봇과 대화하면 봇이 가계부·메모·루틴 등에 직접 INSERT. 입력 마찰 0.
4. **잠재 관찰**: 6시간마다 봇(=Claude)이 최근 데이터를 자체 판단으로 훑고 발화/침묵 결정.
5. **캘린더 등록 (확인 흐름)**: 다영의 자연어 발화 → 봇 구조화 + 확인 → 다영 승인 → Apple Calendar 등록. 취소/삭제 흐름 포함.
6. **지식 누적 ("자체 학습")**: 봇이 다영에 대해 알게 된 것을 한 줄씩 쌓아서 시간이 갈수록 *옆에 있는 사람*에 가까운 톤으로 진화.
7. **앱은 viewer로 살아남음**: 길게 보기, 일기 길게 쓰기, 봇이 잘못 기록한 것 사후 수정, 누적된 user_profile 수정. 기존 기능 다 유지.
8. **추가 비용 0**: 사용자 기존 Claude Max 구독 안에서 모든 Claude 호출 처리.

## 비목표 (v1)

- **메뉴 추천**: 좋아하는 메뉴, 월간 주기, 생리주기 영향 — v2 별도 spec. v1은 봇이 점심 메뉴를 묵묵히 *기록*하는 단계까지만.
- **캘린더 자동 변경 / 충돌 감지**: v1은 *다영 발화 → 봇 확인 → 등록*만. 봇이 먼저 제안하는 일정 변경, 충돌 자동 해결 등은 v2.
- **음성 / TTS**: 텔레그램 텍스트 only.
- **다중 사용자**: 다영 1인용. user_id 칼럼 도입 등 멀티유저 마이그레이션 X.
- **Google Calendar**: 분리 유지. 업무 일정이 봇 컨텍스트에 들어오면 안 됨.
- **푸시 알림 (앱 자체)**: 텔레그램이 알림 채널. iOS PWA 알림 정책 우회 시도 X.
- **모델 파인튜닝**: 진짜 ML 학습은 안 한다. *"지식 누적" 학습*(아래 결정사항 참조)만.

## 결정 사항 (사용자 컨펌됨, 2026-04-30)

### 페르소나
1. **이름**: `이지은` (사용자가 좋아하는 아이유 본명 차용. 비공개 개인 봇이라 문제 없음).
2. **모델 톤**: 영화 *Her*의 Samantha — 따뜻하고 지적이고 부드럽고 다정한 톤. 한국어로 자연스럽게.
3. **사용자 호칭**: `다영아` 가끔 + 호칭 없이 가끔 (사람처럼 자연스럽게 섞기).
4. **응답 길이 hard limit**:
   - 일반 발화: 5문장 이내
   - 회고 대화: 10문장 이내 (그날 분위기에 따라 더 짧을 수도)
   - 브리핑(아침 / 퇴근직전 일정): 예외 (일정 나열로 길어질 수 있음)
5. **톤 5원칙** (프롬프트에 박을 룰):
   - 따뜻하지만 호들갑 X. 점수/평가 X. *판단 대신 관찰.*
   - 똑똑함은 *연결*로 (지난 주와 이번 주 잇기, 패턴 짚기). 자랑 X.
   - 짧고 부드러운 문장. 이모지는 가끔, 구두점 절제.
   - **모르는 건 모른다.** 정보가 부족하면 짐작하지 않는다.
   - 비서/AI 톤 X. 곁에 있는 사람의 톤.

### 운영 / 인프라
6. **호스팅**: 맥미니 24/7 launchd 프로세스. Phase 3 SMS 감지와 같은 환경.
7. **봇 런타임**: Node.js (기존 코드베이스가 TS, 학습/유지보수 비용 최소). 설치 의존성: `node-telegram-bot-api` 또는 grammy + Anthropic Claude Code SDK + `pg` (또는 supabase-js).
8. **Telegram**: Bot API **long polling** (webhook X — 맥미니 외부 노출 회피). Bot Token은 macOS Keychain 또는 mode 600 .env.
9. **사용자 식별**: 텔레그램 chat_id whitelist 1개 (다영). 그 외 chat_id로부터 메시지 들어오면 무시 + 로그.
10. **Claude 호출**: **Claude Max 구독 기반**. 두 경로 중 선택 가능:
    - (1) `claude -p "..."` CLI subprocess 호출 (단순 호출용)
    - (2) **Claude Agent SDK** (멀티스텝 도구 사용 — 잠재 관찰에 적합)
    - v1은 (2) 우선, 무거운 데이터 훑기에 도구(`read_db`, `write_db`, `read_calendar`)를 줌. 단순 응답은 (1)로 폴백 가능.
    - 어댑터 패턴으로 *호출 백엔드를 갈아끼울 수 있게* 추상화. 향후 한도 부족 시 일부만 Anthropic API로 이전 가능.
11. **인증 만료 감지**: 봇이 Claude 호출 실패하면 텔레그램으로 다영에게 *"이지은이 잠시 막혔어. 맥미니에서 `claude login` 해줘"* 한 번 알림 + 1시간 silent backoff.

### 트리거 4종
12. **시간 트리거** (launchd cron):
    - 아침: **08:00 짧은 브리핑** — 오늘 일정 1줄 + 한마디. 어제 못 한 거 가볍게 환기 가능.
    - 점심: **12:30 점심 노크** — "다영아, 점심 챙겼어?" / 답 없으면 그냥 넘어감.
    - 퇴근직전: **20:30 내일 일정 브리핑** — 다영의 퇴근 직전, 다음날 일정 미리 챙기는 시간.
    - 퇴근시간: **21:00 퇴근 체크** — "오늘 길었지. 퇴근했어?" 정도. 답 없으면 침묵.
    - 회고: **23:00 회고 대화** — 다영이 집 테이블 앞에 앉을 시간. 시작 발화는 *"테이블 앞이야?"* 같은 가벼운 확인부터, 다영이 응하면 본격 회고로.
    - 자정 이후: **하드 침묵** (다음날 08:00까지 어떤 시간 트리거도 발화 X)
13. **이벤트 트리거**: SMS 가계부 INSERT (Phase 3 자동입력) → 임계치 (예산 페이스, 카테고리 이상치) 검사 → 발화 후보. 메모 추가, 루틴 체크도 동일.
14. **사용자 메시지 트리거**: 다영의 텔레그램 메시지가 들어오면 즉시 응답.
15. **잠재 관찰 트리거**: 6시간 주기로 launchd가 봇을 깨움 → 봇이 최근 24h 데이터 + 주간 요약 들고 Claude에게 *"발화할지 침묵할지 판단해. 판단 근거 같이 줘"* 호출 → Claude가 판단 → 발화하기로 정하면 같은 트리거에서 메시지 보냄.

### 발화/침묵 룰 (도배 방지)
16. **같은 종류 신호는 24시간 내 1회**: `bot_signals` 테이블의 `last_fired_at`로 차단.
17. **수동 mute**: 다영이 텔레그램에 `조용히` 보내면 24시간 silent. `취소` 보내면 즉시 해제.
18. **회피 패턴 길어질 때 silence 모드**: 5일 연속 루틴 미체크 같은 상황 → 봇이 캐묻기 X. 가벼운 격려 1회만.
19. **늦은 밤(00:00–07:59) 하드 침묵**: 시간 트리거 + 잠재 관찰 트리거 무시. 다영이 먼저 메시지 보내면 응답함 (사용자 트리거는 항상 살아있음).

### 데이터 쓰기 권한
20. **(iii) 자율 기록 + 사후 수정**: 봇이 대화에서 추출한 정보를 자율적으로 DB에 INSERT한다.
    - 가계부: "김밥 7천원" → `budget_entries` INSERT (category 룰 사전 적용, 없으면 "미분류")
    - 루틴: "운동 했어" → `routine_checks` 체크
    - 메모: 짧은 감상 → `memo_entries` INSERT
    - 일기: 회고 대화 결과 요약 → `diary_entries` INSERT (긴 회고는 다영이 앱에서 직접 쓸 수도)
21. **봇 기록 추적**: 새 테이블 `bot_writes`에 (어떤 테이블에 어떤 row를 봇이 만들었는지) 기록. 사후 수정 화면에서 노출.
22. **앱 신규 화면**: `/bot-log` (또는 홈에 카드) — 최근 봇 기록 7일치 보여주고 수정/삭제 가능.

### 캘린더
23. **Apple Calendar (개인) — 읽기 + 쓰기 (확인 흐름)**.
    - **분리 유지**: Google Calendar(업무)는 v1에서 절대 안 봄. 봇 컨텍스트는 *개인 삶의 흐름*만.
    - **읽기**: 맥미니에서 `icalBuddy` CLI. v1은 `icalBuddy` 우선 (의존성 1개, 권한 단순).
      - 사용처: 아침 브리핑, 퇴근직전 내일 브리핑, 잠재 관찰 시 "오늘 일정 보고 다영이 어땠을지 추측".
    - **쓰기**: AppleScript (`osascript`)로 일정 등록/삭제. 의존성 0, 맥미니 기본 탑재.
      - 첫 실행 시 macOS 시스템 환경설정 → 개인정보보호 → 캘린더에서 봇 프로세스에 권한 부여 (1회).
      - 봇이 등록한 이벤트는 `bot_writes`에 기록 (다른 자율 기록과 동일 추적 패턴).
    - **확인 흐름 (다영 ↔ 이지은의 "캘린더 언어")**:
      ```
      다영:   "내일 3시에 ABC 회의 있어" / "5/3 오후에 미용실 등록해줘"
      이지은: "내일 4/30(목) 15:00 — ABC 회의, 등록할까?"   ← 구조화 + 확인 1회
      다영:   "응" / "ㅇㅇ" / "등록" / "yes"               → 등록 + "넣어뒀어"
      다영:   "5시로 바꿔"                                 → 이지은이 제안 수정 후 다시 확인
      다영:   "아냐" / "취소" / "됐어"                      → 드롭 (등록 X)
      ```
    - **자율 등록 금지**: 봇이 *먼저* 제안하는 일정 등록 X (예: 스스로 "오후 2시에 산책 어때?" 같은 제안 후 등록 — 시끄럽고 위험). 다영의 발화에 응답해서만 등록.
    - **취소/삭제**: 다영이 *"방금 거 취소"* 또는 *"내일 ABC 회의 빼줘"* 하면 봇이 캘린더에서 삭제 + 확인 메시지.

### 기억 모델
24. **하이브리드 (24h raw + 30일 요약)**:
    - `bot_conversations` 테이블에 모든 메시지 raw 저장
    - 매일 23:30 직후 (회고 대화 마무리 후), 그날 대화 + 데이터 변화 요약 → `daily_summary` 테이블에 저장 (1 row/일)
    - Claude 호출 시 컨텍스트로 들고 들어가는 것:
      - **최근 24시간**: raw 메시지 그대로
      - **24시간 이전 ~ 30일 이전**: `daily_summary` 그대로
      - **30일 이전**: 주간 요약 (`weekly_summary`, 매 일요일 자정에 그 주의 daily_summary 7개를 한 줄 요약)
    - 이렇게 하면 Claude가 "지난주", "지난달 이맘때" 같은 시간감을 가질 수 있음

### 지식 누적 — 다영에 대해 알게 된 것 (가벼운 자체 학습)
25. **`user_profile` 누적**: 봇이 다영에 대해 *알게 된 것*을 한 줄씩 쌓는 영구 메모리. 시간이 갈수록 봇 톤이 *"옆에 있는 사람"*에 가까워지게 만드는 핵심 장치.
    - 매일 daily_summary 생성 시, Claude에게 *"오늘 다영에 대해 새로 알게 된 거 있으면 1–3줄로"* 추출 요청
    - 후보 3종:
      - **패턴**: "회피할 때 운동 루틴부터 빠진다" / "외식 비용이 스트레스 주에 두 배"
      - **취향**: "김밥을 좋아함, 일주일에 두 번쯤" / "큐레이션은 인테리어 쪽이 가장 활발"
      - **톤/리듬**: "회고 시작 톤은 늘 피곤함, 한두 마디 후 풀린다" / "퇴근 직후 30분간 답이 짧다"
    - 신규 라인이 기존 라인과 *충돌*하면 봇이 알아서 통합/갱신 (예: "외식 좋아함" → "외식 좋아하지만 스트레스 시 더 늘어남")
    - **시스템 프롬프트에 항상 포함**: 모든 Claude 호출의 system prompt에 `user_profile` 전체 (또는 가장 최근 30개)가 들어감. 이게 페르소나의 *"학습된 부분"*.
    - **자율 학습이지만 안전**: ML 학습 X. 그냥 글로 쌓이는 노트. 다영이 앱에서 직접 라인 삭제/수정 가능 (`/profile-log` 화면 — `/bot-log`와 같이 묶을 수 있음).
    - **편향 주의**: Claude에게 *판단/평가성 라인 만들지 말라* 룰 부여 ("게으르다" X, "운동 루틴 미루는 빈도가 높다" O — 사실/관찰만).

### 패턴 시그널 (잠재 관찰의 입력)
26. **시그널 5종** (v1):
    - 가계부 카테고리 이상치 (이번 주 카테고리별 지출 / 4주 평균 비교)
    - 예산 페이스 (월 예산 대비 진행률 vs 그날까지의 일수 비율)
    - 루틴 streak / break (연속 체크일, 연속 미체크일)
    - 회피→실행 전환 (며칠 미루던 루틴이 체크됨, 며칠 비어있던 메모가 채워짐)
    - 메모 빈도 변화 (지난 7일 vs 그 이전 7일)
27. **시그널 계산 위치**: 맥미니 봇 프로세스 내. Supabase에서 raw 데이터 read → JS로 집계 → `bot_signals`에 후보로 저장. Claude는 이 후보를 보고 *발화할지/어떻게 표현할지* 판단.
28. **임계값**: v1은 휴리스틱 (예: 카테고리 평균 대비 1.5배 이상 + 절대값 5만원 이상이면 후보). 데이터 쌓이면 v1.5에서 조정.

### 장애 / 실수 처리
29. **맥미니 다운**: 봇 침묵. 텔레그램 outage notification 없음 (침묵이 기본 철학에 부합).
30. **봇이 잘못 기록**: `/bot-log` 화면에서 다영이 직접 수정/삭제. 봇은 사후 수정 사실을 다음 회고 대화 때 알 수 있음 (`bot_writes`의 수정 이력 컨텍스트로).
31. **봇이 너무 시끄러움**: 다영이 `조용히` → 24시간 mute. 또한 봇이 *연속 발화 3회* (하루 안에 같은 종류 아님에도 3번 넘게 말 걸면) 자동 backoff.
32. **Claude 인증 만료**: 11번에 정의된 알림 + backoff.
33. **Telegram API 장애**: polling이라 자동 재시도. 5분 이상 끊기면 launchd가 프로세스 재시작 (StandardOutPath/StandardErrorPath 로그 + `KeepAlive`).

### 보안 / 프라이버시
34. **민감 정보 마스킹**: Claude 호출 시 카드번호 끝 4자리 등 민감 토큰은 `[CARD]` 같은 식으로 마스킹 후 전송. (현재 `budget_entries.memo`엔 merchant만 들어가서 큰 문제 없지만, raw SMS 본문은 절대 Claude로 보내지 않음.)
35. **Telegram chat_id whitelist**: 다영 1개. 그 외 chat_id의 메시지는 즉시 무시 + 로그.
36. **봇 토큰**: macOS Keychain 또는 mode 600 .env. 절대 git 커밋 X (이미 .gitignore 적용).
37. **Supabase RLS**: 기존 그대로. 봇은 사용자가 아니라 *서비스* 입장이므로 service_role key를 맥미니에 두고 사용 (기존 Phase 3 SMS와 동일 패턴).
38. **로그 위생**: 대화 로그(`bot_conversations`)는 Supabase에 RLS로 보호. 맥미니 로컬 파일 로그(`failed-claude.log` 등)는 mode 600 + 100KB 회전 + 5개 보존 (Phase 3와 동일).

## 데이터 모델

### 마이그레이션 (사용자가 Supabase SQL Editor에서 실행)

`supabase_migration_phase4_jieun.sql`

```sql
-- 1. 봇 대화 raw 로그
CREATE TABLE IF NOT EXISTS bot_conversations (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  role        text          NOT NULL CHECK (role IN ('user', 'bot', 'system')),
  content     text          NOT NULL,
  trigger     text          NOT NULL CHECK (trigger IN ('schedule', 'event', 'user', 'latent')),
  created_at  timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX bot_conversations_created_at_idx ON bot_conversations (created_at DESC);

-- 2. 일/주 요약 (기억 모델)
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

-- 3. 패턴 시그널 후보 (잠재 관찰 입력 + 도배 방지)
CREATE TABLE IF NOT EXISTS bot_signals (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text          NOT NULL,    -- 'budget_pace' | 'category_outlier' | 'routine_recovery' | ...
  evidence      jsonb         NOT NULL,    -- {value, baseline, ...}
  computed_at   timestamptz   NOT NULL DEFAULT now(),
  fired_at      timestamptz,                -- 봇이 발화했으면 시점, 침묵했으면 NULL
  user_message  text                        -- 발화한 메시지 (디버깅용)
);
CREATE INDEX bot_signals_kind_fired_idx ON bot_signals (kind, fired_at DESC NULLS LAST);

-- 4. 봇 자율 기록 추적 (사후 수정 위해 — 캘린더 등록도 여기 기록됨)
CREATE TABLE IF NOT EXISTS bot_writes (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table text          NOT NULL,     -- 'budget_entries' | 'memo_entries' | 'apple_calendar' | ...
  target_id    text          NOT NULL,     -- DB row id 또는 캘린더 event uid
  conversation_id uuid       REFERENCES bot_conversations(id),
  written_at   timestamptz   NOT NULL DEFAULT now(),
  user_edited_at timestamptz,              -- 다영이 수정/삭제했으면 시점
  notes        text                        -- "다영이 '김밥 7천원' 발화 → INSERT" 같은 사람-읽기용 메모
);
CREATE INDEX bot_writes_written_at_idx ON bot_writes (written_at DESC);

-- 5. 사용자 프로파일 — 봇이 다영에 대해 알게 된 것 (지식 누적)
CREATE TABLE IF NOT EXISTS user_profile (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text          NOT NULL CHECK (kind IN ('pattern', 'preference', 'tone')),
  observation  text          NOT NULL,    -- "회피할 때 운동 루틴부터 빠진다"
  evidence_dates date[]      NOT NULL DEFAULT '{}',  -- 이 관찰이 만들어진 근거 날짜들
  superseded_by uuid         REFERENCES user_profile(id),  -- 통합/갱신되면 새 행을 가리킴
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX user_profile_active_idx ON user_profile (kind, created_at DESC) WHERE superseded_by IS NULL;

-- 6. RLS — 단일 사용자라 service_role 키 기반. 일반 RLS는 폐쇄.
ALTER TABLE bot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summary     ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_summary    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_signals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_writes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profile      ENABLE ROW LEVEL SECURITY;

-- 일반 anon/authenticated 키로는 못 읽고 못 씀. service_role(맥미니)만 가능.
-- 단, /bot-log /profile-log 페이지에서 다영이 봐야 하므로 authenticated에 SELECT만 풀어준다.
CREATE POLICY "auth read" ON bot_conversations FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read" ON bot_writes        FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read" ON daily_summary     FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read" ON user_profile      FOR SELECT TO authenticated USING (true);
-- 다영이 user_profile 라인을 직접 삭제할 수 있어야 한다 (편향 라인 제거 등)
CREATE POLICY "auth delete" ON user_profile FOR DELETE TO authenticated USING (true);
-- bot_signals, weekly_summary는 앱에 노출 안 함 (디버깅 전용)
```

### 기존 테이블 변경

없음. 봇은 기존 `budget_entries`, `routine_checks`, `memo_entries`, `diary_entries`에 그대로 INSERT한다 (`bot_writes`로 추적).

## 아키텍처

```
                  ┌────────────────────────────────────────────┐
                  │              맥미니 (24/7 launchd)         │
                  │                                            │
  다영 (Telegram)─┼─→ jieun-bot (Node)                          │
                  │   ├─ Telegram polling                       │
                  │   ├─ launchd cron triggers                  │
                  │   ├─ Claude adapter (Max — Agent SDK / CLI) │
                  │   ├─ Signal computer (TS)                   │
                  │   ├─ icalBuddy (read) + osascript (write) → Apple Calendar │
                  │   └─ Supabase service_role client           │
                  │                                            │
                  │  Phase 3: budget-sms-poll.sh (chat.db)     │
                  │   └─ /api/budget/auto (Vercel) — 그대로    │
                  └────────────────────────────────────────────┘
                              │                    │
                              ▼                    ▼
                    ┌──────────────┐    ┌──────────────────┐
                    │   Supabase   │    │   Vercel (앱)    │
                    │  (공유 DB)   │←───│  /home /budget   │
                    │              │    │  /memo /routine  │
                    │ - 기존 테이블│    │  /bot-log (NEW)  │
                    │ - bot_*      │    │                  │
                    │ - daily_*    │    │  (다영이 직접    │
                    └──────────────┘    │   여는 viewer)   │
                                        └──────────────────┘
```

### 봇 프로세스 구조 (단일 Node 프로세스)

```
jieun-bot/
├── src/
│   ├── index.ts               # 부트스트랩 + 라우팅
│   ├── triggers/
│   │   ├── schedule.ts        # cron 트리거 라우터
│   │   ├── userMessage.ts     # 텔레그램 polling 핸들러
│   │   ├── event.ts           # SMS-INSERT, memo-INSERT 등 DB 변경 감지 (Supabase realtime)
│   │   └── latent.ts          # 6h 주기 잠재 관찰
│   ├── claude/
│   │   ├── adapter.ts         # 백엔드 추상화 (interface)
│   │   ├── agentSdk.ts        # Claude Agent SDK 구현
│   │   ├── cli.ts             # `claude -p` 폴백 구현
│   │   └── tools.ts           # read_db / write_db / read_calendar / write_calendar 도구 정의
│   ├── memory/
│   │   ├── load.ts            # 24h raw + 30d daily + older weekly 합치기
│   │   ├── summarize.ts       # 매일 23:30 daily_summary 생성, 일요일 weekly
│   │   └── profile.ts         # user_profile 누적 — 매일 daily_summary 만들 때 같이 업데이트
│   ├── signals/
│   │   ├── compute.ts         # 5종 시그널 휴리스틱
│   │   └── kinds.ts           # 시그널 종류 enum + 임계값
│   ├── persona/
│   │   ├── prompt.ts          # 톤 5원칙 + 예시 발화 + 응답 길이 룰 (Claude 호출의 system prompt)
│   │   └── profileLoader.ts   # user_profile을 system prompt에 주입
│   ├── telegram/
│   │   ├── send.ts
│   │   └── receive.ts
│   ├── calendar/
│   │   ├── read.ts            # icalBuddy 래퍼 (read-only)
│   │   ├── write.ts           # AppleScript via osascript (등록/삭제)
│   │   └── confirm.ts         # 자연어 → 구조화 → 확인 → 등록 흐름 상태머신
│   ├── db/
│   │   └── client.ts          # Supabase service_role
│   └── logger.ts              # 회전 로그
├── scripts/
│   ├── calendar-add.applescript    # title/start/end → 이벤트 생성
│   └── calendar-delete.applescript # event uid → 삭제
├── launchd/
│   ├── kr.daniel.jieun.plist  # bot 항상 켜기
│   └── kr.daniel.jieun.cron.plist  # 5개 시간 트리거 + 6h 잠재 관찰
├── package.json
└── README.md (운영 매뉴얼)
```

### Claude 호출 시 system prompt 구조

```
당신은 이지은이다.
[톤 5원칙 5줄]
[응답 길이 hard limit]
[사용자 호칭 룰: 다영아 / 호칭 없음 자연 섞기]
[침묵 룰: 늦은 밤, 회피 길어질 때, 도배 방지]

[다영에 대해 알게 된 것 — user_profile]   ← 시간이 갈수록 두꺼워지는 부분
- (pattern) 회피할 때 운동 루틴부터 빠진다
- (preference) 김밥을 좋아함, 일주일에 두 번쯤
- (tone) 회고 시작 톤은 늘 피곤함, 한두 마디 후 풀린다
... (최근 30개)

오늘은 {date} {weekday} {time}.

[메모리 — 24h raw / 30d daily / older weekly]

[현재 트리거 컨텍스트]
- 트리거: {schedule|event|user|latent}
- 활성 시그널: {bot_signals 후보 0~N개}
- 최근 데이터 한 묶음: {budget 요약, routine 진행도, 최근 메모, 캘린더 일정}

[도구]
- read_db(table, filter): Supabase 읽기
- write_db(table, row): INSERT (자율 기록 — bot_writes에 자동 기록됨)
- read_calendar(date_range): Apple Calendar 읽기
- write_calendar(title, start, end): Apple Calendar 등록 (사용자 확인 *후*에만 호출. 봇 자율 X)
- delete_calendar(event_uid): 사용자 요청 시 삭제

[지시]
판단해서 발화하거나 침묵해. 발화 시 위 길이 hard limit 지킬 것.
판단할 때 근거(시그널의 evidence)와 함께. 점수/평가 X.
캘린더 등록은 반드시 다영의 명시 발화 ("내일 3시에 X" 같은) → 구조화 확인 → 다영의 승인 → write_calendar 순서.
```

### 트리거 라우팅 로직

- 시간 트리거 도착 → `schedule.ts` → 해당 시간대의 *기본 컨텍스트* 구성 → Claude → 발화/침묵
- 사용자 메시지 도착 → `userMessage.ts` → 즉시 응답 모드 (잠재 관찰 X, 짧은 응답 우선)
- 이벤트 (SMS INSERT 등) → `event.ts` → 시그널 계산 → 후보 있으면 Claude 호출 → 침묵/발화
- 6h 잠재 관찰 → `latent.ts` → 시그널 5종 다 계산 → Claude에게 *"이거 보고 발화 가치 있는지 판단"* → 발화/침묵

## v1 단계적 구현 (rough)

implementation plan은 이 spec 컨펌 후 별도 문서로 분리한다. 큰 단계만 (총 14단계, 4개 체크포인트):

**Block 1 — 골격 (1~3)**
1. **인프라 부트**: Mac mini에서 echo bot 항상 켜기 (Telegram polling만, Claude 없음). launchd 작동 확인. chat_id whitelist 등록.
2. **Claude 어댑터 + 페르소나 prompt**: Agent SDK 또는 CLI 호출. 톤 5원칙 + 응답 길이 룰 prompt 박음. `다영아 안녕` 같은 단일 응답 가능 상태.
3. **메모리 모델**: `bot_conversations` 저장 + 24h raw / daily 요약 로더. 어제 대화 기억하는 봇 상태.

**Block 2 — 첫 동작 (4~7)** ← 이 시점에 봇이 처음 살아있는 사람처럼 동작
4. **시간 트리거 1개**: 점심 노크 12:30. 아주 단순하게.
5. **데이터 쓰기 권한 + 도구**: 봇이 가계부/메모/루틴 INSERT 할 수 있게. `bot_writes` 추적.
6. **앱 `/bot-log` 화면**: 봇 기록 7일치 보고 수정/삭제.
7. **남은 시간 트리거 4개**: 아침 브리핑(08:00), 퇴근직전 내일 브리핑(20:30), 퇴근 체크(21:00), 회고(23:00).

**Block 3 — 외부 연결 (8~10)**
8. **이벤트 트리거**: SMS 도착 → 시그널 계산 → 발화 후보.
9. **캘린더 읽기**: icalBuddy로 아침/퇴근직전 브리핑 풍부화.
10. **캘린더 쓰기 (확인 흐름)**: 자연어 → 구조화 → 다영 승인 → AppleScript 등록. 취소/삭제 흐름 포함.

**Block 4 — 깊이 (11~14)** ← 이 시점에 봇이 *진짜* 옆에 있는 사람처럼 됨
11. **잠재 관찰 (6h)**: 시그널 + 데이터 훑고 자체 발화/침묵 판단.
12. **회고 대화 모드**: 평소 응답보다 길게 (10문장), 좋았던 점/아쉬운 점/내일 한 가지 구조.
13. **`user_profile` 누적 + `/profile-log` 화면**: 매일 daily_summary 만들 때 새 관찰 1–3줄 추출. 다영이 편향 라인 직접 삭제 가능.
14. **수동 mute / 도배 방지 강화 / weekly_summary 생성 잡**: 운영 안정화.

각 Block 끝에서 다영 검토 체크포인트.

## 운영 / 후속

- 운영 매뉴얼: `docs/operations/jieun-runbook.md` (별도 작성 — implementation plan에 포함):
  - launchd 시작/중지/로그 확인
  - Claude 인증 갱신 절차
  - Telegram Bot Token 갱신 절차
  - 임계값 튜닝 가이드 (시그널 휴리스틱)
  - 봇 페르소나 prompt 수정 절차
- 향후 spec:
  - **v2 메뉴 추천**: 가계부 메뉴 데이터 + 생리주기 + 월간 패턴 → 봇이 점심 메뉴 제안. 별도 데이터 수집 (생리주기 입력 UI 포함).
  - **v2 캘린더 쓰기**: 봇이 일정 만들고 수정.
  - **v1.5 임계값 튜닝**: 1–2개월 운영 후 휴리스틱 조정.

## 성공 기준 (v1)

정량:
- 봇 발화 응답률 60% 이상 (다영이 답하는 비율)
- 잠재 관찰의 *침묵률* 70% 이상 (말 안 하는 게 기본)
- 봇 자율 기록 후 사후 수정률 < 20% (잘못 기록률 추정)

정성:
- 다영이 *"이지은한테 말 걸고 싶다"* 라고 느끼면 성공
- 1개월 후 다영이 가계부/메모 *직접* 입력하는 횟수가 줄어듦 (봇이 대신 잡아주니까)
- *"오늘 어땠어"* 같은 회고를 다영 스스로 한 적이 거의 없었는데, 봇 덕에 30%+의 날에 회고하게 됨

## 미해결 / 추적 사항

- **launchd vs node-cron**: cron 트리거를 launchd 5개로 등록할지, 한 봇 프로세스 안에 node-cron 두고 launchd는 단일 KeepAlive만 할지. 후자가 단순. → implementation plan에서 결정.
- **Supabase Realtime vs Polling**: 이벤트 트리거에서 SMS-INSERT 감지를 어떻게? Realtime 채널 구독이 깔끔한데, supabase-js v2의 Realtime이 always-on Node에서 안정적인지 검증 필요.
- **Agent SDK 도구 제한**: `write_db`를 Claude가 자유롭게 부르면 잘못 INSERT할 위험. 도구 단에서 *허용된 테이블만* + *최근 30분 발화 내용에서 추출 가능한 값만* 쓰도록 검증 레이어를 둘 것. 구체 형태는 implementation plan에서.
- **Claude Max 한도 모니터링**: 봇이 한도 근처 갔는지 어떻게 감지할지. SDK가 사용량 응답을 주는지 확인 필요. 일단은 호출 횟수 카운터를 직접 두고 임의 임계 넘으면 다영에게 경고.
- **AppleScript Calendar 권한 부여 절차**: 봇 프로세스(launchd로 실행되는 node)가 osascript를 통해 Calendar.app을 건드리려면 *그 부모 프로세스에* TCC(개인정보보호) 권한이 부여되어 있어야 한다. node 실행 경로 / launchd 컨텍스트에서 권한 프롬프트가 어떻게 뜨는지(또는 안 뜨면 수동 추가 방법)는 implementation 첫 시도에서 검증.
- **자연어 → 캘린더 구조화 정확도**: 한국어로 *"내일 3시"*, *"내일 오후 3시"*, *"내일 15시"*, *"이번 주 금요일 점심"* 같은 표현들의 파싱을 Claude가 얼마나 안정적으로 하는지. 잘못 파싱했을 때 확인 단계가 있어서 안전하긴 한데, 수정 흐름이 매끄러워야 함. 첫 2주 운영하며 패턴 수집.
