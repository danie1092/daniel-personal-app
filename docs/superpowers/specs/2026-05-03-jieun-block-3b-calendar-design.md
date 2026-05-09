# 이지은 v1 — Block 3b: Apple Calendar read/write 설계

- **작성일**: 2026-05-03
- **상태**: Draft (사용자 컨펌 — 2026-05-03 brainstorming 세션)
- **부모 spec**: [`2026-04-30-jieun-agent-architecture-design.md`](./2026-04-30-jieun-agent-architecture-design.md) — 결정사항 #23 상세화
- **선행 조건**: Block 1~4 v1 완료 (어제 2026-05-03 마무리). 봇 launchd로 가동 중, 5종 트리거 + actions JSON dispatch + bot_writes 추적 + auto-backoff 다 동작.
- **후속**: 본 spec 컨펌 후 `2026-04-30-jieun-agent-v1-implementation.md`의 Task 3.9~3.14 placeholder 채움 (writing-plans).

## 배경

부모 spec 결정사항 #23은 *"Apple Calendar 개인 only — 읽기 + 쓰기 (확인 흐름)"* 까지만 박혔고, 상세 결정 — pending state 저장 위치, 자연어 파싱 백엔드, TCC 권한 부여 절차, 삭제 매칭 범위 — 은 미해결로 남겨졌다. 어제 Block 4까지 v1 골격 다 들어가면서 *마지막 남은 placeholder* 가 됐다.

이 spec은 그 4개 미해결을 박고, Block 3b의 컴포넌트 경계 / 액션 4종 / 흐름 / 운영을 정한다.

## 결정 (사용자 컨펌, 2026-05-03)

### D1. Pending state — in-memory `Map<chatId, Pending>`
다영 발화 → 봇 확인 → 다영 승인 사이의 *pending* 상태는 봇 프로세스 메모리.

```ts
type Pending =
  | { kind: 'register'; title: string; start: string; end: string; proposedAt: number }
  | { kind: 'delete';   targetUid: string; display: string;       proposedAt: number };

const pending = new Map<number, Pending>();  // chatId → 1개
```

- LIFO: 새 제안이 기존 pending 덮음 ("5시로 바꿔" 흐름과 자연스럽게 일치)
- 5분 expire (자다 깨서 옛날 제안에 "응" 한 케이스 silent 차단)
- 봇 reload 시 휘발 — graceful fallback: 매칭 실패하면 봇이 "어 미안 다시 말해줄래?" (잘못 등록보다 조용한 실패가 안전)

**왜 in-memory**: DB 테이블은 ephemeral 5분 짜리 상태에 마이그레이션/RLS 추가하는 과함. 메모리 의존 only(가계부 패턴)는 Claude의 컨텍스트 hallucination → 외부 시스템(다영 폰 캘린더 알림)에 잘못 등록 위험. 코드 명시 매칭이 *외부 시스템 쓰기* 의 안전선.

### D2. 자연어 파싱 — Claude 단일 호출 (추가 호출 0)
user 트리거에서 Claude가 평소 응답 만들면서 *동시에* `<actions>` JSON에 `propose_calendar_event` emit. 페르소나 system prompt의 `[지금]` 권위 ("오늘은 2026-05-03(일) 14:23") 활용.

- "내일 3시 ABC" → `start: "2026-05-04T15:00:00+09:00"`
- "이번 주 금요일 점심" → 같은 호출 안에서 변환
- 잘못 파싱 시: 다영이 확인 단계에서 거부 → drop 또는 수정 흐름

**왜**: `chrono-node` 등 라이브러리는 한국어 약함. 한국어 mature 라이브러리 부재. Agent SDK가 이미 매 user 트리거 호출 중이라 *추가 호출 0*. 안전망(확인 단계)이 잘못된 파싱을 막음.

### D3. TCC 권한 — prebooked + lazy 폴백 + plan 검증 게이트
Mac mini에서 봇은 LaunchAgent (다영 사용자 컨텍스트). osascript/icalBuddy는 권한 카테고리 2개 필요:
- icalBuddy → "캘린더 전체 접근" (EventKit)
- osascript → "자동화 → Calendar.app 제어"

배포 1회 다영 GUI 세션에서 수동 부여 (runbook 절차) + 봇이 권한 부족 fail 감지 시 텔레그램 1회 안내 + auto-backoff 도배 차단.

**검증 게이트**: launchd 컨텍스트에서 GUI 권한이 상속되는지 plan Task 3.11이 검증. 안 되면 plist의 `LimitLoadToSessionType=Aqua` 등 조정.

**왜 prebooked**: 다영 = 운영자 = 사용자라 1회 setup 자연스러움. 부팅마다 dry-run은 reload 잦은 개발 단계에서 시끄러움. 첫 사용 시 시스템 프롬프트 떴다 사라지는 케이스 risk.

### D4. 삭제 매칭 — `bot_writes` 매개 only
봇이 등록한 일정만 삭제 가능. icalBuddy 전체 캘린더 검색 X.

```sql
SELECT target_id, notes, written_at
FROM bot_writes
WHERE target_table = 'apple_calendar'
  AND user_edited_at IS NULL
ORDER BY written_at DESC;
```

- "방금 거 취소" → 가장 최근 1행
- "내일 ABC 빼줘" → 시간/제목 매칭, multi-hit이면 봇이 "(1)(2) 어떤 거?"
- 매칭 실패 (다영이 폰에서 직접 만든 일정) → "그건 내가 등록한 게 아니라서 직접 지워야 해"

**삭제도 등록과 같은 확인 흐름**: pending Map 재사용 (`kind: 'delete'`). 봇이 삭제 의도 인식 → propose → 다영 "응" → 실행.

**왜**: spec 정신 ("자율 등록 X, 다영 발화에 응답해서만")과 일치 — *내가 만든 거에만 손댄다*. 다영 본인 수동 일정에 봇이 잘못 손대는 사고 차단.

### D5. 등록 후 수정은 v1 비범위
다영이 "5시로 바꿔" 했을 때:
- 등록 *전* (pending 살아있음): pending Map LIFO로 새 제안이 덮음 (자동 처리)
- 등록 *후*: delete + 새 register 연쇄. 봇이 "지우고 다시 등록할까?" 자연스럽게 분기.

직접 update API 안 만듦 — 흐름 단순.

## 데이터 모델

**변경 없음.** 새 테이블/컬럼/마이그레이션 X. 기존 `bot_writes` 그대로:
- `target_table = 'apple_calendar'`
- `target_id = event_uid` (osascript add가 반환한 Apple Calendar UID)
- `notes = "다영이 '내일 3시 ABC' 발화 → 등록"` 사람-읽기용

기존 가계부/메모/루틴 자율 기록과 동일 추적 패턴이라 `/bot-log` 페이지에 자동 노출됨.

## 컴포넌트 / 파일 구조

```
jieun-bot/src/calendar/
  read.ts        # icalBuddy 래퍼 — date_range → Event[]
  write.ts       # osascript 래퍼 — add(title,start,end) → uid / delete(uid) → ok
  parse.ts       # Claude action payload 검증/정규화 (pure, ISO 시간 sanity)
  pending.ts     # in-memory Map + LIFO + expire (pure, testable)
  context.ts     # 트리거별 캘린더 prompt 섹션 빌더 (read.ts 호출 감춤)
  scripts/
    calendar-add.applescript     # title, ISO start, ISO end → uid stdout
    calendar-delete.applescript  # uid → ok stdout
```

각 파일 단일 책임:
- `read.ts`: icalBuddy 호출 + plist 파싱 → 정형 `Event[]`. 입력 `{from, to, calendar?}`. 의존: `child_process.exec`.
- `write.ts`: osascript 호출 + uid 추출. 입력은 검증된 ISO 문자열만. 의존: `child_process.exec` + `scripts/*.applescript`.
- `parse.ts`: Claude의 action payload (`{title, start, end}`)가 형식 맞나 검증. 잘못된 payload는 reject 후 다영에게 "다시 말해줘" 응답. **pure 함수, 외부 의존 없음.**
- `pending.ts`: Map 래퍼 — `set/get/expire/clear`. **pure, 외부 의존 없음. unit test 쉬움.**
- `context.ts`: 트리거에서 호출하는 facade — `briefingForToday()`, `briefingForTomorrow()`, `latentSnapshot()`. read.ts를 감춤.

`claude/actions.ts` 확장 — 액션 4종 추가:
- `propose_calendar_event` — payload `{title, start, end}`. executor: `parse.ts` 검증 → `pending.set(...kind:'register')` → Claude의 user-facing 텍스트가 확인 발화로 텔레그램 전송.
- `propose_calendar_delete` — payload `{targetUid, display}`. executor: bot_writes 검증 (uid 진짜 봇이 등록한 거 맞나) → `pending.set(...kind:'delete')` → 확인 발화.
- `confirm_calendar_action` — payload 없음. executor: `pending.get` → kind 분기 → write.ts 실행 → bot_writes INSERT/update → "넣어뒀어" / "지웠어".
- `cancel_calendar_action` — payload 없음. executor: `pending.delete`. no-op.

multi-hit 처리: Claude가 후보 candidate 받았는데 다영이 모호하게 발화 ("ABC 빼줘"인데 후보 2개) → 봇이 그 턴엔 propose 액션 안 emit, 그냥 "(1) 15:00 ABC회의 (2) 17:00 ABC 후속, 어떤 거?" 자연어 응답. 다영이 "1번" / "첫 번째" 하면 다음 턴 Claude가 그 후보로 propose_calendar_delete.

## 흐름

### 등록
```
다영: "내일 3시 ABC"
  → userMessage trigger → Claude (Agent SDK)
  → response text + action: propose_calendar_event
       {title:"ABC", start:"2026-05-04T15:00:00+09:00", end:"2026-05-04T16:00:00+09:00"}
  → executor:
       parse.validate(...)
       pending.set(chatId, {kind:'register', ...})
  → telegram.send(Claude의 자연어 — "내일 5/4(월) 15:00 ABC, 등록할까?")

다영: "응"
  → userMessage trigger → Claude
  → response text + action: confirm_calendar_action
  → executor:
       const p = pending.get(chatId)
       if (!p) → "어 뭘 등록할까?" (graceful fallback, no-op)
       if (p.kind === 'register'):
         const uid = await write.add(p.title, p.start, p.end)
         await bot_writes.insert({target_table:'apple_calendar', target_id:uid, notes:...})
         pending.delete(chatId)
  → telegram.send("넣어뒀어")
```

### 삭제
```
다영: "내일 ABC 회의 빼줘"
  → userMessage trigger → router
  → 컨텍스트 빌더가 bot_writes 매칭 결과 prompt에 주입 (예: 후보 1개 — uid=X, "내일 15:00 ABC")
  → Claude: response text + action: propose_calendar_delete {targetUid:"X", display:"내일 15:00 ABC"}
  → executor:
       pending.set(chatId, {kind:'delete', ...})
  → telegram.send("내일 5/4(월) 15:00 ABC, 지울까?")

다영: "응"
  → 동일 confirm_calendar_action 흐름 →
  → executor: write.delete(p.targetUid) → bot_writes.update({user_edited_at: now()}) → telegram.send("지웠어")
```

### 취소
```
다영: "아냐"
  → action: cancel_calendar_action
  → executor: pending.delete(chatId)
  → telegram.send("그래 안 할게")
```

### 컨텍스트 주입 (브리핑 / 잠재 관찰)

| 트리거 | 주입 내용 | 출처 |
|---|---|---|
| 08:00 schedule (아침) | 오늘 일정 텍스트 (`[오늘 캘린더]`) | `context.briefingForToday()` |
| 20:30 schedule (퇴근직전) | 내일 일정 텍스트 (`[내일 캘린더]`) | `context.briefingForTomorrow()` |
| 6h latent | 오늘 일정 + 어제 일정 (가벼운 컨텍스트) | `context.latentSnapshot()` |
| 12:30 점심 / 21:00 퇴근 / 23:00 retro / event | **주입 안 함** (불필요 노이즈) | — |

캘린더 prompt 섹션 형식 (예시):
```
[오늘 캘린더]
- 10:30–11:30 영어 수업
- 15:00–16:00 ABC 회의 (봇 등록)
```
`(봇 등록)` 라벨은 bot_writes 매칭으로 자동 마킹. 다영이 회고 시 *내가 만든 일정 vs 봇 등록* 구분 가능.

## TCC 권한 — 운영 매뉴얼 추가

`docs/operations/jieun-runbook.md` 신규 섹션 (Block 3b 배포 시 다영이 1회 수행):

> ### 캘린더 권한 셋업 (Block 3b 첫 배포 1회)
> 1. Mac mini 다영 GUI 세션에서 터미널 열기.
> 2. `icalBuddy eventsToday` → "jieun-bot이 캘린더에 접근하려고 합니다" 프롬프트 → "허용".
> 3. `osascript -e 'tell application "Calendar" to count of calendars'` → "Terminal이 Calendar.app을 제어하려고 합니다" → "허용".
> 4. 봇 reload: `launchctl unload -w ... && launchctl load -w ...`
> 5. 텔레그램에 `테스트 등록해줘 — 내일 오후 9시 권한테스트` 발화 → 등록 확인 → "응" → 폰 캘린더 알림 뜨는지 확인.
> 6. **launchd 컨텍스트 권한 못 받는 경우** (osascript fail) — plist 수정 절차는 plan Task 3.11에 박힘.
>
> ### 권한 reset 감지 (운영 중)
> 봇이 `osascript`/`icalBuddy` 호출을 권한 부족으로 fail하면 텔레그램에 1회 안내 ("자동화 권한 끊겼나봐 — 시스템 환경설정 → 개인정보보호 한 번 봐줘"). 이후 auto-backoff(3회 발화 silent)가 도배 차단.

## 보안 / 안전

- **메모리 노출 표면 0** — pending Map은 봇 프로세스 안 변수. 외부 출구 없음.
- **삭제 범위 제한** — bot_writes에 없는 일정은 봇이 영원히 못 건드림. 다영이 폰에서 직접 만든 일정 안전.
- **TCC 권한 reset 시** — lazy 폴백 + auto-backoff(Block 4) 도배 차단.
- **Google Calendar 절대 접근 X** — icalBuddy 호출 시 `-ic <개인 캘린더 이름>` 또는 `-ec <업무 캘린더 이름>` 명시. plan Task 3.9에서 다영의 실제 캘린더 목록(`icalBuddy -sc`) 확인 후 hardcode.
- **잘못 등록 가드** — 모든 등록은 다영 명시 "응" → write.add 호출. pending 없으면 confirm 액션 graceful fallback.

## 테스트 전략

| 컴포넌트 | 방식 |
|---|---|
| `pending.ts` | Vitest unit (set/get/expire/LIFO/empty) |
| `parse.ts` | Vitest unit (ISO 검증, 잘못된 payload reject) |
| `context.ts` | read.ts mock + 텍스트 출력 스냅샷 |
| `read.ts` | child_process exec mock + 정상 plist / 빈 결과 / fail 케이스 |
| `write.ts` | child_process exec mock + uid 추출 / fail 케이스 |
| 액션 dispatch | 기존 `actions.test.ts` 패턴 — 새 4종 케이스 추가 |
| Integration | Mac mini에서 manual — CI는 Linux라 osascript/icalBuddy 둘 다 unavailable |

## v1 비범위 (재확인)

- 봇 *자율* 캘린더 등록 X (산책 제안 등 봇 발 시작 일정) — 다영 발화 응답으로만
- 등록 *후* update API X — delete + 새 register 연쇄
- Google Calendar 통합 X
- 캘린더 충돌 자동 감지 X (v2)
- 반복 일정 (`weekly`, `daily`) X — 다영이 일정 단위로 발화하면 그것만 등록
- 캘린더 알림(reminder) 시간 봇 설정 X — Apple Calendar 기본값 사용

## 운영 / 후속

- runbook 업데이트는 plan 마지막 task에 포함 (Block 4 패턴과 일관)
- 1~2주 운영 후 자연어 파싱 정확도 / TCC 권한 안정성 별도 followup으로 추적 (`docs/superpowers/HANDOFF.md`에 큐)
- v2 후보:
  - 자율 일정 제안 (산책/식사 등) — 다영의 user_profile 누적 후 가능
  - 충돌 감지 ("내일 3시 X 등록할까?" 시 기존 14:30 일정과 충돌 알림)
  - 등록 후 수정 API
  - 반복 일정

## 미해결 / 추적 사항

- **launchd 컨텍스트 권한 상속** — Task 3.11 첫 osascript 호출이 권한 프롬프트 띄우는지 확인. 안 뜨면 plist 조정 필요. 안 뜨고 silent fail이면 lazy 폴백 안내 메시지 봇이 보내고 다영이 수동 처리.
- **icalBuddy plist 출력 안정성** — `icalBuddy -nc -nrd -b "" -ps "|" eventsToday` 같은 형식. 빈 결과 / 종일 일정 / 며칠 걸친 일정 케이스 plan에서 검증.
- **multi-hit 모호성** — "ABC 빼줘"인데 후보 2개일 때 봇이 candidate를 어떻게 다음 턴까지 들고 가는지: bot_writes 후보 list를 prompt에 박는 거로 해결 (state 휘발성 X — bot_writes는 영속이라). 단 다영이 다음 턴 응답이 모호하면 (`"음~"` 같은) Claude가 적절히 재질문.
- **시간대** — Mac mini 시스템 시간대 KST 가정. plan Task 3.11에 `date` 출력 KST 검증.
- **5분 expire 적당한가** — 너무 짧으면 다영이 자기 전 잠깐 폰 보고 "응" 못 보내는 케이스. v1은 5분, 운영 보고 조정 (followup).

## 성공 기준

정량 (1~2주 후 측정):
- 등록 confirmation rate > 90% (propose 후 confirm/cancel 결정 비율)
- 잘못 등록 (다영이 폰에서 즉시 삭제) < 10%
- 자연어 파싱 정확도 — pending 단계에서 다영이 "어 시간 다른데" 발화하는 비율 < 20%

정성:
- 다영이 폰 캘린더 앱 안 열고 봇 발화로 등록 마무리
- 아침/퇴근직전 브리핑에 일정 한 줄이 *맥락 있는 한마디*로 변함 ("내일 1시 ABC 있네 — 점심 미리 챙겨")
