# 이지은 에이전트 v1 — Block 4 설계 (깊이)

> **Block 4 = v1 완성**. Block 1-3a 검증 완료, 라이브 회귀 정리 끝(2026-05-02). 이 문서는 14 task를 3 phase로 묶고 각 task의 구현 방향을 정한다. 세부 task 단위 step은 별도 plan 문서로 분리(`docs/superpowers/plans/2026-05-03-jieun-block4-implementation.md`).

## 배경

Block 4는 v1의 *깊이* 단계다. Block 1-3a까지는 봇이 "정해진 시간/이벤트에 발화하는" 수준이고, 라이브에서 다영의 진단으로 본 *2% 부족*은 “*맞아 너 며칠 전에 X 썼었잖아*” 류의 **연결**이 약하다는 것이다. 24h raw 메모리만으론 *연결할 자료* 자체가 부족.

이 spec은 spec-2026-04-30(jieun-agent-architecture-design) Block 4 섹션을 task 단위로 풀고, 14 task의 구현 순서/묶음/세부 결정을 정한다.

## 목표

1. **Memory backbone 깔기** — 모든 트리거가 즉시 똑똑해지는 substrate (daily/weekly summary + user_profile)
2. **잠재 관찰 트리거** — Claude 자체가 발화/침묵 판단 (70% 침묵 목표)
3. **회고 모드 깊이** — 23:00 retro에서 cramp 안 되도록 chunk cap 분기
4. **운영 안정화** — `/profile-log` UI / 수동 mute / 자동 backoff / runbook

## 비목표 (Block 4 범위 밖)

- 캘린더 read/write (Block 3b — Plan 미작성, 우선순위 낮음)
- PIN 인증 (별도 spec)
- 시그널 휴리스틱 임계값 v1.5 튜닝 (운영 데이터 누적 후)
- 별도 followups 큐 (HANDOFF 기재 4건 — Block 4 후 또는 spawn)

## 결정 사항 (사용자 컨펌됨, 2026-05-03)

### Build order (3 phase)

Spec의 task 순서(4.1 latent → 4.3 retro → 4.4 daily ...) 대신 **memory backbone 먼저** 묶음. 이유: 잠재 관찰(4.1)이 user_profile/summary 없는 상태로 도는 기간을 없애고 *연결의 데이터 기반*을 먼저 깔기 위해.

- **Phase 4a (Memory)**: 4.4 daily_summary 생성 → 4.5 loader → 4.8-4.9 user_profile 누적/통합 → 4.10 system prompt 주입
- **Phase 4b (Latent + Retro)**: 4.1-4.2 잠재 관찰 → 4.3 retro 깊이 → 4.6-4.7 weekly summary
- **Phase 4c (Ops)**: 4.11 /profile-log UI → 4.12 수동 mute → 4.13 자동 backoff → 4.14 runbook

각 phase 끝에서 라이브 검증 체크포인트.

### chunk cap 정책

기존 `MAX_CHUNKS_PER_TURN = 1` 모든 트리거 hard cap을 trigger kind 별 분기로 바꾼다. 회고만 max 3, 나머지 1 유지. 카톡 결(한 chunk 짧게)은 그대로 두면서 retro의 "질문→답→follow-up" 자연 흐름만 풀어줌.

```ts
function getChunkCap(t: TriggerKind, sk?: ScheduleKind): number {
  if (t === 'schedule' && sk === 'retro') return 3;
  return 1;
}
```

### 잠재 관찰 cron 슬롯

spec "6h 주기"는 운영적으로 **활성 시간대 3 슬롯**으로 해석: **10:00 / 15:00 / 19:30**. 기존 schedule 트리거(08, 12:30, 20:30, 21, 23) + silence window(00-08)와 안 겹치는 시간. 봇 내 node-cron으로 등록 (기존 schedule 트리거와 같은 패턴, launchd plist 변경 X).

### daily_summary 생성 조건

회고 응답 여부와 무관하게 **23:30에 항상 생성**. 회고 안 한 날도 데이터 기반 짧게 ("외식 1회, 운동 체크. 대화 없음."). 시간 흐름 유지 위해.

### user_profile 추출 위치

daily_summary 생성과 **같은 Claude 호출**에서 structured output으로 같이 추출. single round trip, 비용 0, 일관성. 추출된 observation rows를 같은 트랜잭션에서 INSERT.

### 수동 mute 저장 위치

신규 테이블 `bot_mute` (PK fixed='singleton', mute_until timestamptz). 단순 + 빠른 조회. `bot_conversations`에 system row로 박는 방식보다 자동 트리거 entry 체크가 깔끔.

---

## Phase 4a — Memory Backbone

### 구성요소

#### 4a-1. daily_summary 생성 잡

- **위치**: `jieun-bot/src/jobs/dailySummary.ts` (신규)
- **트리거**: 봇 내 node-cron, 매일 23:30
- **입력 데이터** (그날치):
  - `bot_conversations` 24h
  - `budget_entries` today
  - `routine_checks` today
  - `memo_entries` today
- **Claude 호출**: agentSdk single round trip, structured output
  ```
  [입력]
  - 오늘 대화 raw
  - 오늘 데이터 변화 묶음
  - 활성 user_profile 30개 (중복 관찰 만들지 말라는 컨텍스트로)

  [지시]
  JSON으로 출력:
  {
    "summary": "오늘 1~3문장 요약 (관찰만, 평가/판단 X)",
    "new_observations": [
      {"kind": "pattern" | "preference" | "tone", "observation": "...", "evidence_dates": ["YYYY-MM-DD"]}
    ]
  }
  - 새 관찰 없으면 new_observations: [] 그대로
  - "다영은 게으르다" 같은 평가 X. "운동 루틴 미루는 빈도가 늘었다" O (사실/관찰만)
  - 기존 user_profile에 이미 있는 관찰은 다시 만들지 마. 충돌 시 다음 잡(consolidate)에서 처리됨.
  ```
- **저장**:
  - `daily_summary` INSERT (PK=date, ON CONFLICT DO UPDATE summary)
  - `user_profile` rows INSERT (kind, observation, evidence_dates=[today])
  - INSERT 직후 4a-2 consolidate 잡 invoke
- **회고 응답 없는 날**: 그래도 호출. 데이터만 있는 짧은 summary 생성.
- **에러 처리**:
  - Claude 호출 실패 → 5분 후 1회 재시도, 그래도 실패면 로그만 (다음날 작업 안 막음)
  - JSON 파싱 실패 → summary는 데이터 기반 fallback (`\`외식 ${n}회, 메모 ${m}건...\``), new_observations는 빈 배열

#### 4a-2. user_profile 통합

- **위치**: `jieun-bot/src/profile/consolidate.ts` (신규)
- **흐름**:
  1. 신규 observation INSERT 직후, 활성 user_profile (`superseded_by IS NULL`)과 텍스트 유사도 비교
  2. 유사도: 단순 substring 또는 토큰 Jaccard >= 0.5 기준 후보 N건
  3. 후보 있으면 Claude 두 번째 호출 (cheap, observation N+1줄만):
     ```
     [입력] 기존 obs / 신규 obs
     [출력] {"action": "keep_old" | "replace" | "merge", "merged_text": "..."}
     - merge: 두 관찰을 합친 새 텍스트 (예: "외식 좋아함" + "스트레스 시 외식 늘어남" → "외식 좋아하지만 스트레스 시 더 늘어남")
     - replace: 신규가 더 정확/구체적. 기존 superseded.
     - keep_old: 신규 무시. 기존 활성 유지.
     ```
  4. action 처리:
     - `keep_old` → 신규 row DELETE (방금 INSERT 취소)
     - `replace` → 기존 row의 `superseded_by`에 신규 id 세팅
     - `merge` → merged_text로 새 row INSERT, 기존 + 방금 신규 모두 새 row로 supersede
- **에러 처리**: Claude 호출 실패 시 신규 row 그대로 유지 (다음날 다시 시도되지 않음 — 누적되지만 다영이 /profile-log에서 정리 가능)

#### 4a-3. memory loader 확장

- **위치**: `jieun-bot/src/memory/load.ts` (수정)
- **현재**: 24h raw 메시지만 로드
- **확장**:
  - `loadMemorySection()` 반환 구조 확장
    - `recent24h: Message[]` (기존)
    - `dailySummaries: { date, summary }[]` — 24h~30d
    - `weeklySummaries: { week_start, summary }[]` — 30d 이전 (Phase 4b 채워짐, 그 전엔 빈)
  - `getProfileSection()` 신설: 활성 user_profile (superseded_by IS NULL) 최근 30개, kind별 grouping
- **prompt 통합 형식**:
  ```
  [메모리]
  지난 24h:
  - (다영) ...
  - (이지은) ...

  지난 30일 요약:
  - 5/2: 외식 1회, 운동 체크. ...
  - 5/1: 메모 4건, 평소보다 많음. ...
  ...

  더 이전 (주간 요약):
  - 4/19~4/25: ...
  ```
- **token 폭증 방지 + 중복 회피**:
  - dailySummaries: 최대 30개. 가장 최근 30일.
  - weeklySummaries: 최대 12주(3개월). **가장 최근 30일에 걸치는 주는 제외**(daily와 중복 방지). 즉 `week_start < today - 30days` 인 주만.

#### 4a-4. persona prompt 확장

- **위치**: `jieun-bot/src/persona/prompt.ts` (수정)
- **추가 섹션** (`[지금]` 바로 위):
  ```
  [다영에 대해 알게 된 것]
  - (pattern) 회피할 때 운동 루틴부터 빠진다
  - (preference) 김밥을 좋아함, 일주일에 두 번쯤
  - (tone) 회고 시작 톤은 늘 피곤함, 한두 마디 후 풀린다
  ...
  ```
- **빈 배열 시 섹션 통째 생략** — token 절약 + 첫 며칠 noise 방지
- **kind별 grouping**: 가독성 위해 `[패턴]`/`[취향]`/`[톤]` 묶음으로 출력하거나 inline `(kind)` prefix — inline 추천(persona prompt 다이어트와 일관)

### 마이그레이션

신규 없음. Phase 4 마이그레이션(`supabase_migration_phase4_jieun.sql`)에 `daily_summary`, `weekly_summary`, `user_profile` 다 있고 RLS 정책도 적용됨.

### 테스트

- **dailySummary.test.ts**: Claude mock으로 JSON 응답 → INSERT 호출 + consolidate invoke verify. JSON 파싱 실패 fallback verify.
- **consolidate.test.ts**: 유사 obs fixture로 conflict 후보 추출 → Claude mock으로 keep_old/replace/merge 각 액션별 DB 변경 verify.
- **memory/load.test.ts** 확장: 30일치 daily_summary fixture로 cap(30) 작동 + 형식 verify.
- **persona/prompt.test.ts** 확장: profile 0건/3건/30건 시나리오로 섹션 포함/생략 + 형식 verify.

### Phase 4a 검증 (라이브)

- 23:30 cron 발화 → daily_summary row 1건 생김
- /profile-log (Phase 4c 전엔 SQL로) 확인 → user_profile에 새 row 누적
- 다음날 트리거 시 봇 응답에서 *연결*이 보이기 시작 ("그저께 외식 많았는데..." 류)
- 회고 안 한 날에도 daily_summary 생성됨

---

## Phase 4b — Latent Observation + Retro Deepening

### 구성요소

#### 4b-1. 잠재 관찰 cron 3 슬롯

- **위치**: `jieun-bot/src/index.ts` (schedule 등록 부분 확장)
- **슬롯**: **10:00 / 15:00 / 19:30**
- **이유**:
  - 기존 schedule(08, 12:30, 20:30, 21, 23) + silence(00-08)와 안 겹침
  - 활성 시간대 균등 분배 (4-5h 간격)
- **node-cron 패턴**: 기존 schedule 트리거 등록과 동일. trigger kind = 'latent'

#### 4b-2. latent trigger

- **위치**: `jieun-bot/src/triggers/latent.ts` (신규)
- **흐름**:
  1. computeSignals(): event 트리거와 같은 시그널 계산 (5종)
  2. contextSection: memory + profile + signals + 최근 데이터 한 묶음
  3. Claude 호출, structured output:
     ```
     [지시]
     침묵이 기본. 다영에게 *지금 말 거는 것이 자연스러운가* 만 판단.
     말 걸 가치 없으면 침묵해. 어색하면 침묵해. 도배되면 침묵해.
     {
       "speak": boolean,
       "reason": "왜 발화/침묵 결정했는지 1문장",
       "message": "speak=true 시에만, 한 chunk로 끝나는 메시지"
     }
     ```
  4. speak=true → router 통해 telegram send + `bot_conversations` INSERT (trigger='latent')
  5. speak=false → 로그만 (`{trigger:'latent', spoke:false, reason}`), 발화 X
- **목표 침묵률 70%+**: prompt에서 명시. 운영 후 발화율 누적 → 임계값 prompt 튜닝
- **에러 처리**: Claude 실패 → silent skip (잠재 관찰은 best-effort, 실패가 다영에게 안 보여야 함)

#### 4b-3. chunk cap trigger 별 분기

- **위치**: `jieun-bot/src/telegram/send.ts` + `jieun-bot/src/triggers/router.ts` (수정)
- **변경**:
  ```ts
  // send.ts
  export function getChunkCap(triggerKind: TriggerKind, scheduleKind?: ScheduleKind): number {
    if (triggerKind === 'schedule' && scheduleKind === 'retro') return 3;
    return 1;
  }

  export async function sendChunked(chatId, chunks, opts: { cap: number, log: Logger, trigger: TriggerKind }) {
    const kept = chunks.slice(0, opts.cap);
    const dropped = chunks.slice(opts.cap);
    if (dropped.length > 0) {
      opts.log.info('chunks capped', { trigger: opts.trigger, total: chunks.length, kept: kept.length, dropped });
    }
    for (const c of kept) await bot.sendMessage(chatId, c);
  }
  ```
- **router 수정**: `runTrigger` 시 cap을 `getChunkCap(trigger, scheduleKind)` 으로 계산해서 send에 전달
- **호환성**: 기존 `MAX_CHUNKS_PER_TURN` 상수 제거, 모든 호출처가 `getChunkCap` 통과하도록

#### 4b-4. retro mode prompt

- **위치**: `jieun-bot/src/persona/prompt.ts` (`getRetroSection()` 신설)
- **호출**: schedule trigger kind='retro'일 때만 prompt에 포함
- **내용**:
  ```
  [지금 회고 시간]
  좋았던 점 / 아쉬운 점 / 내일 한 가지 흐름.
  다영이 응할 때만 풀고 짧게 끝나도 OK.
  한 chunk 3-4문장. 최대 3 chunks.
  따라가는 질문은 1개 정도까지.
  시작 톤은 가볍게 ("테이블 앞이야?" 류).
  ```
- **chunk cap 3과 짝**: prompt 룰 + 코드 cap 둘 다 동일 숫자. prompt 위반 시 코드가 자른다는 약속.

#### 4b-5. weekly_summary 잡

- **위치**: `jieun-bot/src/jobs/weeklySummary.ts` (신규)
- **트리거**: 봇 내 node-cron, 매주 일요일 23:59
- **입력**: 그 주(월~일)의 daily_summary 7개
- **Claude 호출**:
  ```
  [입력] 7개 daily summary
  [지시] 그 주 1줄 요약 (관찰만, 평가 X)
  ```
- **저장**: `weekly_summary` INSERT (PK=week_start=일요일 날짜)
- **memory loader 통합**: 30일 이전 구간을 weekly_summary로 자동 표시 (4a-3에서 이미 구조 깔림)
- **에러 처리**: 실패 시 다음주에 다시 시도 안 함 (단순화). 누락 주는 운영 매뉴얼에서 수동 backfill 가능

### 마이그레이션

신규 없음.

### 테스트

- **latent.test.ts**: Claude mock speak=false 시 send 호출 X verify. speak=true 시 단일 chunk send + bot_conversations INSERT verify.
- **send.test.ts** 확장: getChunkCap unit (kind별 8 case). cap 적용 후 dropped 로그 verify.
- **weeklySummary.test.ts**: 7개 daily fixture → Claude mock 1줄 → INSERT verify.

### Phase 4b 검증 (라이브)

- 10:00/15:00/19:30 슬롯에서 latent 트리거 fire. 처음 며칠은 침묵률 측정.
- 23:00 retro 트리거 시 다영 응답에 따라 follow-up까지 (chunks 2-3) 자연스럽게 흐름.
- 다른 schedule (08, 12:30, 20:30, 21) 여전히 1 chunk.
- 일요일 23:59 weekly_summary row 생김.

---

## Phase 4c — Ops

### 구성요소

#### 4c-1. /profile-log 페이지

- **위치**: `src/app/(authed)/profile-log/page.tsx` + Server Action (Next.js 앱 측, jieun-bot 아님)
- **패턴**: 기존 `/bot-log`와 동일 구조
- **노출**: 활성 user_profile (superseded_by IS NULL), 최근 30개, kind별 grouping
- **카드 형태**: kind 뱃지 + observation + evidence_dates + delete 버튼
- **delete Server Action**:
  - authenticated user (다영)만 호출 가능 — RLS `auth delete` 정책 이미 있음
  - hard delete (CASCADE 또는 superseded_by 참조 정리: 신규 row가 옛 row를 가리키면 신규 row 삭제 시 옛 row는 그대로)
  - delete 후 revalidatePath
- **수정 기능 X**: spec상 delete만 (편향 라인 제거 용도)

#### 4c-2. 수동 mute

- **위치**:
  - 신규 `jieun-bot/src/db/botMute.ts` (CRUD helper)
  - `jieun-bot/src/triggers/userMessage.ts` 수정 (메시지 분기 추가)
- **마이그레이션**: `supabase_migration_phase4c_bot_mute.sql` (신규)
  ```sql
  CREATE TABLE IF NOT EXISTS bot_mute (
    id           text          PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
    mute_until   timestamptz,
    updated_at   timestamptz   NOT NULL DEFAULT now()
  );
  INSERT INTO bot_mute (id, mute_until) VALUES ('singleton', NULL) ON CONFLICT DO NOTHING;
  ALTER TABLE bot_mute ENABLE ROW LEVEL SECURITY;
  -- service_role만 접근 (앱 노출 X)
  ```
- **API**:
  ```ts
  isMuted(): Promise<boolean>     // mute_until > now() ? true
  muteFor(hours: number): Promise<void>  // mute_until = now() + hours
  cancelMute(): Promise<void>     // mute_until = NULL
  ```
- **userMessage 분기**: 메시지 trim/lower 후 정확히 "조용히" → muteFor(24) + ack ("응 24시간 조용히 있을게.") / "취소" → cancelMute() + ack ("응 풀었어."). Claude 호출 X.
- **자동 트리거 entry 체크**: schedule/event/latent runner 시작에서 `await isMuted()` → true면 silent skip + 로그.
- **user 트리거는 mute 무시**: 다영이 먼저 보내면 항상 응답 (취소 메시지를 받기 위해서도 필요).

#### 4c-3. 자동 backoff

- **위치**: `jieun-bot/src/triggers/router.ts` 수정
- **로직**:
  ```ts
  async function shouldBackoff(): Promise<boolean> {
    // 24h 안 bot 메시지 중, 그 사이 user 메시지 0개 인 연속 횟수
    const rows = await db
      .from('bot_conversations')
      .select('role, created_at')
      .gte('created_at', new Date(Date.now() - 24*3600*1000).toISOString())
      .order('created_at', { ascending: false });
    let consecutive = 0;
    for (const r of rows) {
      if (r.role === 'bot') consecutive++;
      else if (r.role === 'user') break;
    }
    return consecutive >= 3;
  }
  ```
- **schedule/event/latent entry**: `if (await shouldBackoff()) { log.info('backoff: 3+ unanswered'); return; }`
- **user 트리거 시 자동 reset**: user 메시지 INSERT 자체가 카운터 reset (위 로직이 user 만나면 break)
- **mute와 직교**: 둘 다 silent skip이지만 별개. 자동 backoff은 24h가 지나면 다음 트리거에서 새로 평가됨 (3개 메시지가 24h 윈도우 밖으로 빠지면 자동 해제)

#### 4c-4. 운영 매뉴얼

- **위치**: `docs/operations/jieun-runbook.md` (신규)
- **섹션**:
  - launchd 시작/중지/로그 (PID, 재시작, plist 위치)
  - Claude 인증 갱신 (`claude login` Mac mini 직접)
  - Telegram Bot Token 갱신 (BotFather + .env)
  - 봇 reload 명령
  - 시그널 임계값 튜닝 가이드 (각 시그널 함수 위치 + 휴리스틱)
  - 페르소나 prompt 수정 절차 (test 돌리고 reload)
  - mute 수동 해제 (SQL 쿼리)
  - 잠재 관찰 발화율 모니터링 쿼리
    ```sql
    SELECT
      DATE_TRUNC('day', created_at) as day,
      SUM(CASE WHEN role='bot' THEN 1 ELSE 0 END) as bot_msgs,
      SUM(CASE WHEN role='user' THEN 1 ELSE 0 END) as user_msgs
    FROM bot_conversations
    WHERE trigger='latent' AND created_at > now() - interval '7 days'
    GROUP BY 1 ORDER BY 1;
    ```
  - 장애 대응 흐름 (Realtime CHANNEL_ERROR, Telegram polling 멈춤, Claude 한도 초과)

### 테스트

- **botMute.test.ts**: muteFor → isMuted true → cancelMute → isMuted false 시퀀스. 만료 시간 경계 테스트.
- **router.test.ts** 확장: shouldBackoff 시나리오 (3 bot 연속 / 중간 user / 0건) unit. mute true 시 silent skip verify.
- **userMessage.test.ts** 확장: "조용히" / "취소" 메시지 분기 verify. Claude 호출 X verify.
- **/profile-log**: page render + delete Server Action mock. RLS auth delete policy 작동 (이미 마이그레이션에 있음).

### Phase 4c 검증 (라이브)

- /profile-log 페이지 다영이 열어보기. 라인 직접 삭제 가능.
- 텔레그램에 "조용히" → 24h 자동 트리거 발화 0건 / "취소" → 즉시 정상화.
- 자동 backoff 3개 누적 상황 (다영이 응답 안 하는 날) → 봇 silent.
- runbook 한 번 처음부터 끝까지 다영이 따라 읽어 검증.

---

## 데이터 모델 변경 정리

| 마이그레이션 | 추가 |
|-|-|
| `supabase_migration_phase4_jieun.sql` (이미 적용) | `daily_summary`, `weekly_summary`, `user_profile` 다 있음 |
| `supabase_migration_phase4c_bot_mute.sql` (신규) | `bot_mute` (singleton row) |

기존 테이블 변경 없음.

---

## 운영 / 후속

- **별도 followups 큐** (HANDOFF 기재, Block 4 후 또는 spawn):
  1. schedule 트리거 phantom text replay
  2. realtime CHANNEL_ERROR 안정성 (polling fallback)
  3. 병렬 INSERT race condition (handler debounce)
  4. `is_table_in_publication()` defense-in-depth
- **Block 3b** (캘린더 read/write): Plan 미작성. AppleScript Calendar TCC 권한 미해결. v1+ 별도 spec 가능성.
- **PIN 인증**: 별도 spec.

## 성공 기준 (Block 4 = v1 완료)

- 4주차쯤부터 `user_profile`에 라인 30+개 누적
- 봇 응답에 *연결*이 자연스럽게 등장 ("지난주 외식 늘었는데 이번 주는...", "그저께 운동 빠졌었으니까...")
- 잠재 관찰 침묵률 70%+
- 회고 대화 진행률 30%+ (다영이 응답해서 chunks 2개 이상 흐른 비율)
- /profile-log에서 다영이 편향 라인 1회 이상 삭제 (운영 검증)
- 24h 안 발화 0건 mute 흐름 + 자동 backoff 작동 라이브 검증

## 미해결 / 추적 사항

- user_profile 유사도 임계 (Jaccard 0.5)는 운영 후 조정 — 너무 낮으면 통합 잘 안 되고, 너무 높으면 잘못된 통합
- weekly_summary 누락 주 backfill 절차 (수동 SQL) — runbook에 포함
- 잠재 관찰 발화율 모니터링 자동화 — v1.5 (지금은 SQL 쿼리 수동)
- chunk cap 분기로 인한 prompt token 사용량 변화 모니터링 — retro에서 길어진 만큼 30일 cumulative 확인 필요
