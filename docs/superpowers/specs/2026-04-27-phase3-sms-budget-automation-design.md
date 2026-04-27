# Phase 3 — SMS 결제문자 가계부 자동입력

- **작성일**: 2026-04-27
- **상태**: Draft (사용자 컨펌 후 작성)
- **선행 조건**: Phase 0 (보안 베이스라인), Phase 1.5b (가계부 리노베이션 — Server Components + 13개 카테고리 토큰), Phase 2 (큐레이션 자동화 — 베스트-에포트 + cron 회수 패턴)
- **후속**: 없음. Phase 3로 가계부 입력 라인 자동화가 끝남.

## 배경

가계부는 매일 들어오는 카드 결제문자를 사용자가 클립보드로 복사 → `/api/budget/auto`에 paste → 폼 자동 채움 → 저장하는 반-수동 흐름이다. Phase 1.5b에서 이 endpoint(`/api/budget/auto`)는 손대지 않고 디자인만 정리했고, Phase 3에서 자동화한다.

사용자의 카드 결제문자는 iPhone에서 Continuity로 **맥미니의 메시지 앱**에도 동시에 도착한다. 맥미니는 항상 켜져 있는 환경이라, 거기서 새 결제문자를 잡아 `/api/budget/auto`로 자동 POST하는 것이 가장 깨지지 않는 경로다.

또한 현재 endpoint는 모든 항목을 `category = "미분류"`로 INSERT한다. 사용자가 매번 가계부 페이지에서 손으로 분류하는 부담을 줄이기 위해, **merchant→category 사전**을 두고 같은 가맹점이 두 번째 결제될 때부터 자동 분류되도록 한다. 사전은 사용자가 가계부 페이지에서 미분류를 분류하는 평소 동작만으로 자동 학습된다.

## 목표

1. **수집 자동화**: 맥미니 메시지 앱이 받은 결제 SMS를 30초 이내에 `/api/budget/auto`로 자동 POST.
2. **카테고리 자동 분류**: `merchant_category_map` 사전을 두고, 사전에 있으면 자동 분류 / 없으면 "미분류"로 INSERT.
3. **자동 학습**: 사용자가 가계부 페이지에서 미분류 entry의 카테고리를 변경하면, 그 매핑이 사전에 upsert되고 같은 merchant + 미분류 상태인 다른 entries도 한 번에 일괄 업데이트.
4. **카드 커버리지 확장**: 기존 현대카드 + 우리카드에 **하나체크카드** 파서 추가.
5. **보안 베이스라인 적용**: `/api/budget/auto`에 Phase 0 패턴(`requireBudgetSecret` + Upstash rate limit) 추가. 인증 누락 endpoint를 정리.
6. **연도 버그 수정**: `new Date().getFullYear()` 고정 대신 SMS 수신 시각(KST) 기준 연도.

## 비목표

- LLM 기반 카테고리 분류 (룰 사전 우선 + 신규는 미분류 정책. 카테고리 표류 방지).
- 사용자 카드 등록 화면 / 카드사 SMS 형식 자동 학습.
- 다른 OS / iPhone 직접 트리거 (맥미니가 항상 켜져있어서 불필요).
- 결제 외 메시지 (택배, 인증번호 등) 처리.
- 푸시 알림.
- 다중 사용자 / 다중 기기.

## 결정 사항 (사용자 컨펌됨, 2026-04-27)

1. **트리거**: macOS chat.db 폴링 + launchd. 30초 간격. 의존성 0 (bash + sqlite3 + curl).
2. **결제 SMS 식별**: chat.db SELECT 단계에서 본문에 `승인` AND `원` 둘 다 포함한 메시지로 1차 필터. 발신자 화이트리스트는 없음 (사용자가 카드사 번호 알려주면 추후 추가).
3. **상태 추적**: `~/.config/budget-sms/state.txt`에 마지막 처리한 chat.db `ROWID` 저장. 같은 ROWID 이하는 무시.
4. **인증**: `BUDGET_SMS_SECRET` 환경변수 + `Authorization: Bearer ...`. Phase 0 `requireCronSecret`과 동일 timing-safe 비교 패턴.
5. **Rate limit**: Upstash sliding window. 키 `budget-auto:global`. 30/분 + 500/일 (사람 결제 빈도 한참 위, 봇 폭탄 방지용).
6. **카테고리 정책**: 룰 사전(`merchant_category_map`) 우선 → 미스면 `"미분류"` 고정.
7. **자동 학습 트리거**: 가계부 페이지의 `updateCategory` Server Action에서 미분류 → 카테고리 변경 시 ① `merchant_category_map` upsert ② 같은 user + merchant + `category="미분류"` 상태인 다른 entries 일괄 update.
8. **연도 결정**: chat.db `message.date`(Apple epoch ns, 2001-01-01 기준) → KST 변환 → 그 시점의 YYYY 사용.
9. **중복 방지**: API 측에 `(user_id, date, amount, merchant, payment_method)` UNIQUE 제약. state.txt 유실 시 재처리해도 DB가 막음.
10. **파서 분리**: 단일 파일 → `src/lib/budget/parsers/{hyundai,woori,hana}.ts` + `index.ts`(라우트 함수). 카드 추가 시 파서 1개 + 라우트 1줄만 수정.
11. **raw_text 길이 제한**: 4KB 초과 시 400 반환. 정규식 backtracking 방어 + 메모리/CPU 폭주 차단.
12. **로그 위생**: `failed-parses.log` / `failed-network.log` 모두 mode 600. 100KB 도달 시 `*.1`로 회전, 최대 5개 보존, 그 이후는 폐기. SMS 본문엔 카드번호 끝 4자리 / 누적 결제액이 포함되므로 평문 보호 필요.
13. **macOS 알림 위생**: 401 시 `osascript display notification` 본문에 fixed string만(예: `"BUDGET_SMS_SECRET 인증 실패 — secret 확인 필요"`). raw_text / secret / 응답 body 절대 포함 금지.
14. **운영 문서**: `docs/operations/budget-sms-runbook.md` 신설. secret 로테이션 절차(분기 1회 권장 + 유출 시 즉시), poll.sh 디버깅, 새 카드 파서 추가 절차, Vercel/macOS 환경변수 동기화 체크리스트.

## 데이터 모델

### 마이그레이션 (사용자가 Supabase SQL Editor에서 실행)

`supabase_migration_phase3_sms.sql`

```sql
-- 1. merchant→category 사전
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

-- 2. 중복 방지 UNIQUE 제약
-- (정확히 같은 결제가 두 번 들어오는 경우는 0이라고 가정. 같은 가맹점 동일 금액 동일 일자가
-- 진짜 두 번 발생하는 일은 거의 없고, 발생하더라도 사용자가 손으로 추가하는 게 빠름)
ALTER TABLE budget_entries
  ADD CONSTRAINT budget_entries_dedup_uniq
  UNIQUE (user_id, date, amount, memo, payment_method);
```

> `budget_entries.memo`에는 merchant가 들어간다 (Phase 1.5b 기준). `merchant`라는 별도 컬럼은 없음.

## 아키텍처

```
┌───────────────────────────────┐
│  iPhone (결제 SMS 수신)        │
│   ↓ Continuity                 │
│  맥미니 메시지 앱 → chat.db    │
└───────────────────────────────┘
            ↓
┌───────────────────────────────┐  30초 / launchd
│  ~/.config/budget-sms/poll.sh │
│   1. sqlite3 chat.db SELECT    │
│      WHERE ROWID > $LAST       │
│      AND text LIKE '%승인%'    │
│      AND text LIKE '%원%'      │
│   2. 각 row를 curl POST        │
│   3. state.txt 갱신 (성공 시)  │
└───────────────────────────────┘
            ↓ HTTPS + Bearer
┌───────────────────────────────┐
│  /api/budget/auto              │
│   1. requireBudgetSecret       │
│   2. Upstash rate limit        │
│   3. parsers[]에서 첫 매칭     │
│      → {amount,merchant,date,  │
│         payment_method}        │
│   4. merchant_category_map     │
│      조회 → category 결정      │
│   5. budget_entries INSERT     │
│      (UNIQUE 충돌 시 409)      │
└───────────────────────────────┘
            ↓
┌───────────────────────────────┐
│  Supabase                      │
│   - budget_entries             │
│   - merchant_category_map      │
└───────────────────────────────┘
            ↑
┌───────────────────────────────┐
│  사용자 → 가계부 페이지        │
│   미분류 entry 카테고리 변경   │
│   → updateCategory(action)     │
│     ① map upsert               │
│     ② 같은 merchant + 미분류   │
│        entries 일괄 update     │
└───────────────────────────────┘
```

## 컴포넌트

### 맥미니 측 (`~/.config/budget-sms/`)

| 파일 | 역할 |
|---|---|
| `poll.sh` | sqlite3로 chat.db 쿼리 → 결제 SMS만 필터 → curl POST. 응답 201(신규 INSERT) 또는 409(중복 — 이미 처리됨)면 state.txt 갱신. 422(파싱 실패) → `failed-parses.log` + state.txt 갱신. 401/5xx/네트워크 실패 → state.txt 진행 안 함 (재시도 대상). 401은 즉시 중단 + macOS 알림 |
| `state.txt` | `LAST_ROWID=12345` 한 줄 |
| `secret.env` | `BUDGET_SMS_SECRET=...` (mode 600, gitignore) |
| `failed-parses.log` | API가 422 반환한 raw_text 보존. 새 파서 추가 시 참고 |
| `failed-network.log` | 3회 연속 curl 실패 시 raw_text + timestamp 기록 |
| `com.daniel.budget-sms.plist` | launchd agent. `~/Library/LaunchAgents/`에 심링크 또는 복사. `StartInterval=30`, `RunAtLoad=true` |
| `setup.sh` | Full Disk Access 안내 + plist load 자동화 + 첫 실행 시 현재 chat.db 최대 ROWID로 state.txt 초기화 (과거 메시지 폭탄 방지) |
| `README.md` | 설치 / 권한 / 디버깅 / 새 카드 추가 절차 |

### Vercel API 측

| 파일 | 변경 |
|---|---|
| `src/lib/auth/requireBudgetSecret.ts` | **신규**. Phase 0의 `requireCronSecret`을 일반화한 `requireSecret(req, envName)` 헬퍼를 두고 wrapper 2개로 분기하는 게 자연스러움 — Phase 0 재구성도 함께 |
| `src/lib/budget/parsers/hyundai.ts` | 기존 `parseHyundai` 이전 |
| `src/lib/budget/parsers/woori.ts` | 기존 `parseWoori` 이전 |
| `src/lib/budget/parsers/hana.ts` | **신규**. 사용자가 SMS 샘플 1~2개 제공 후 작성 |
| `src/lib/budget/parsers/index.ts` | `parsers: ((text: string, smsDate: Date) => Parsed \| null)[]` 배열, `parse()` 함수 |
| `src/lib/budget/categorize.ts` | `lookupCategory(supabase, userId, merchant): Promise<string>`. 미스 시 `"미분류"` |
| `src/lib/budget/types.ts` | `Parsed = { amount, merchant, date, payment_method }` |
| `src/app/api/budget/auto/route.ts` | 위 모듈 조합. user_id는 secret 인증이라 환경변수 `BUDGET_SMS_USER_ID`로 고정 (사용자 본인의 user uuid). raw_text 4KB 초과 시 400. rate limit은 secret 체크 이전 |
| `docs/operations/budget-sms-runbook.md` | **신규**. secret 로테이션, 새 카드 파서 추가, poll.sh 디버깅, 환경변수 동기화 체크리스트 |

### 가계부 페이지 측 (Phase 1.5b 위에 보강)

| 파일 | 변경 |
|---|---|
| `src/app/(main)/budget/actions.ts` | `updateCategory(entryId, newCategory)` 보강: 기존 entry의 `category === "미분류"` AND `newCategory !== "미분류"`일 때 ① 본인 entry update ② `merchant_category_map` upsert ③ 같은 user + 같은 memo + `category = "미분류"`인 다른 entries 일괄 update. 세 호출은 직렬 (Supabase JS는 transaction 미지원, RPC로 묶을지는 plan 단계 결정). 실패 시 ①은 성공 보장, ②③ 실패는 로그만 남기고 무시 (다음에 다시 분류해도 idempotent) |

## 데이터 흐름

### 신규 결제 (사전 미스)

1. 결제 SMS 수신 → 맥미니 chat.db `ROWID = N`로 INSERT.
2. 30초 안에 `poll.sh` 발견.
3. POST `/api/budget/auto` `{ raw_text }`.
4. 파서 매칭 → `{ amount, merchant, date(KST), payment_method }`.
5. `lookupCategory(merchant)` → 사전 미스 → `category = "미분류"`.
6. `budget_entries` INSERT.
7. 응답 201 + entry.
8. `poll.sh`가 state.txt를 N으로 갱신.
9. 사용자가 며칠 후 가계부 페이지 미분류 카드 탭 → 카테고리 chip "카페" 선택.
10. `updateCategory` Server Action: ① `merchant_category_map` upsert (`user, merchant="메가엠지씨커피", category="카페"`) ② 같은 merchant + 미분류 상태인 다른 entries 일괄 update.
11. 다음번 같은 가맹점 결제부터는 사전 히트 → 자동 "카페" 분류.

### 재결제 (사전 히트)

1~4. 동일.
5. `lookupCategory(merchant)` → "카페" 히트.
6. `budget_entries` INSERT (`category="카페"`).
7~8. 동일.

### 중복 (state.txt 유실 또는 사용자 수동 재실행)

1~5. 동일.
6. INSERT 시 UNIQUE 충돌 → DB가 거부.
7. 응답 409.
8. `poll.sh`는 409도 "정상"으로 처리해 state.txt 갱신 (이미 처리됨 의미).

## 보안

- **인증**: `BUDGET_SMS_SECRET` (256bit 랜덤). 맥미니의 `secret.env`에만 평문 저장 (mode 600). Vercel 환경변수에도 동일 값. timing-safe 비교.
- **Rate limit**: `budget-auto:global` 키, 30/분 + 500/일. Phase 2의 `collect:global` 패턴 그대로.
- **user_id 처리**: 본 endpoint는 단일 사용자 전용이라 `BUDGET_SMS_USER_ID` 환경변수로 고정. 다중 사용자 확장 시 secret을 user별로 발급하는 식으로 변경 (미래 확장점, 지금은 단순화).
- **anon key 사용 중단**: 기존 코드는 `NEXT_PUBLIC_SUPABASE_ANON_KEY`로 INSERT — Service Role Key로 교체 (RLS 우회) + secret으로 외부 차단.
- **로컬 secret 노출 방지**: `~/.config/budget-sms/`는 사용자 home 아래라 다른 사용자 접근 불가. plist엔 secret 박지 않음 (poll.sh가 `secret.env` source). `secret.env`는 mode 600 + Time Machine/iCloud 백업 제외 (`tmutil addexclusion` 또는 백업 대상 외 경로 사용 — 위치 확정은 plan 단계).
- **DoS 방어 순서**: rate limit을 secret 체크 **이전**에 배치 (또는 secret 체크에 도달하기 전 IP 단위 가벼운 limit 1단). secret 모르는 봇 폭탄 시 401 응답에도 Vercel invocations가 소모되는 비용을 막기 위함. Phase 0 `requireCronSecret` 호출 사이트에서 패턴 확인 후 plan에서 확정.
- **입력 크기**: raw_text 4KB 초과 차단 (결정사항 11). 본문 정규식은 atomic 형태로 catastrophic backtracking 방어.
- **로그 민감정보**: `failed-parses.log`는 raw SMS 평문이라 mode 600 + 회전(결정사항 12). 디버깅 끝나면 사용자가 수동으로 비울 수 있도록 README에 안내.
- **알림 노출 금지**: macOS notification 본문에 raw_text/secret/응답 데이터 절대 포함 금지 (결정사항 13).

## 에러 처리

| 시나리오 | 처리 |
|---|---|
| 네트워크 실패 (curl exit ≠ 0) | state.txt 진행 안 함 → 다음 폴링에서 재시도. 같은 ROWID 3회 연속 실패 시 skip + `failed-network.log` 기록 |
| 파싱 실패 (422) | `raw_text` `failed-parses.log`에 기록, state.txt 진행. 사람이 가끔 보고 새 파서 추가 |
| 인증 실패 (401) | poll.sh 즉시 중단 + `osascript -e 'display notification'`으로 macOS 알림 |
| Rate limit (429) | `Retry-After` 헤더 따라 sleep 후 재시도 |
| Insert 충돌 (409 — UNIQUE) | 정상 처리로 간주, state.txt 진행 |
| chat.db 락 | sqlite3 `-readonly`. 락이면 1회 retry, 또 실패 시 다음 폴링까지 대기 |
| `updateCategory`의 일괄 update 실패 | entry 본인 변경은 성공 보장. 일괄 update 부분만 console.error 후 무시 (다음에 같은 분류 재시도해도 idempotent) |

## 테스트 전략

- **파서 단위 테스트** (`src/lib/budget/parsers/*.test.ts`): 카드별 1~2개 SMS 픽스처 (현대카드 앱알림 + [Web발신] 두 형식, 우리카드, 하나체크카드). 추출 결과 4-tuple 검증 + 연도가 `smsDate` 기준인지 확인.
- **사전 조회** (`categorize.test.ts`): hit 케이스 / miss 케이스 (`"미분류"` 반환).
- **Server Action 보강** (`actions.test.ts`): updateCategory 호출 후 ① map에 row 생성 ② 같은 merchant 미분류 entries 일괄 업데이트 둘 다 수행되는지.
- **API route** (`route.test.ts` 보강): secret 누락 → 401, secret OK + 사전 히트 → 분류 적용된 entry, secret OK + 미스 → 미분류 entry, UNIQUE 충돌 → 409.
- **맥미니 스크립트**: bash라 단위 테스트 생략. README에 수동 검증 절차 (테스트 SMS chat.db에 INSERT → poll.sh 1회 실행 → API 응답 + state.txt 갱신 확인).

## 오픈 이슈 (Plan 단계에서 해결)

1. **하나체크카드 SMS 샘플** — 사용자가 plan 작성 시 1~2개 raw 텍스트 첨부. 그 형식 보고 `hana.ts` 파서 작성.
2. **`requireCronSecret` 일반화 여부** — Phase 0 헬퍼를 그대로 두고 `requireBudgetSecret`을 별도로 만들지, `requireSecret(envName)`로 일반화할지. plan 단계에서 코드 보고 결정.
3. **`BUDGET_SMS_USER_ID` 부트스트랩** — 사용자의 Supabase user uuid를 어떻게 얻을지. supabase dashboard에서 직접 복사하는 절차를 README에 명시.
4. **시간대 변환 정확도** — chat.db `message.date`는 nanoseconds since 2001-01-01 UTC (Apple epoch). poll.sh에서 sqlite3가 직접 변환할지, raw_text와 함께 ISO timestamp를 별도 필드로 보낼지.
5. **Rate limit 위치 확정** — Phase 0 / Phase 2의 rate limit이 secret 체크 전후 어디서 적용되는지 코드 확인 후 일치/보정. secret 모르는 봇이 401 폭탄 시에도 invocations 소모 안 되도록 secret 체크 이전 단으로 통일.
6. **`secret.env` 백업 제외 경로** — `~/.config/budget-sms/`는 Time Machine 기본 백업 대상. `tmutil addexclusion` 또는 `~/Library/Application Support/budget-sms/`(백업 제외 경로) 중 어디로 둘지 결정. 사용자 환경 확인 후.
