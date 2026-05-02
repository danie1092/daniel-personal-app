# 이지은 에이전트 v1 — 세션 핸드오프

> **새 세션은 이 문서부터 읽고 시작.** Block 3a 끝 + 라이브 회귀 정리 끝, Block 4 시작 직전 상태.

## 어디까지 왔나

- **Branch**: `claude/blissful-gates-fa9b73`
- **Worktree**: `/Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73`
- **봇**: Mac mini에서 launchd로 살아있음. 다영이랑 텔레그램에서 매일 대화 중.
- **Spec**: [`docs/superpowers/specs/2026-04-30-jieun-agent-architecture-design.md`](specs/2026-04-30-jieun-agent-architecture-design.md)
- **Plan**: [`docs/superpowers/plans/2026-04-30-jieun-agent-v1-implementation.md`](plans/2026-04-30-jieun-agent-v1-implementation.md) (Block 3b/4는 헤더만, 상세 미작성)

## 완료 상태

### ✅ Block 1 (골격) — 완전 검증됨
- jieun-bot 부트, Phase 4 마이그레이션 (7 테이블 + RLS)
- env/logger/db client + bot_conversations CRUD
- Telegram echo + chat_id whitelist (다영 chat_id: `8680678263`)
- launchd plist (KeepAlive=true)
- Claude Agent SDK 어댑터 (Max 구독 인증)
- 페르소나 system prompt — 다영의 라이브 피드백으로 5+ 라운드 튜닝됨

### ✅ Block 2 (첫 동작) — 완전 검증됨
- 트리거 라우터 공통 흐름, 5개 cron 트리거
- Action 파서 + executor + bot_writes 추적
- Next.js `/bot-log` 페이지 + 삭제 Server Action
- 자정~07:59 하드 침묵

### ✅ Block 3a (이벤트/시그널) — 완전 검증됨
- Supabase Realtime 구독 (`budget_entries` INSERT)
- 5종 시그널 + 24h dedup
- event 트리거 통합 (INSERT → computeSignals → contextSection → runTrigger → markFired)

### ✅ 2026-05-02 라이브 검증 회귀 정리 (4 commits) — 검증됨
1. **`cb19583` Realtime publication 누락 fix** — `budget_entries`가 `supabase_realtime` publication에 없어서 7건+ INSERT가 한 번도 handler 호출 안 함. `supabase_migration_phase4b_realtime.sql` 추가 (ALTER PUBLICATION + `is_table_in_publication()` 헬퍼 함수). 다영 dashboard에서 ALTER 적용 후 reload → 즉시 발화 검증.
2. **`28ed9a0` event 트리거 `error_max_turns` fix** — `agentSdk.ts` `maxTurns: 1 → 3`. SDK가 1턴 안에 못 끝내는 prompt에서 확률적 fail.
3. **`684c067` chunk count regression — 코드 hard cap** — prompt 룰 3차 강화 후에도 봇이 일관 2 chunks. Sonnet의 "empathy + question" 본능이 prompt instruction보다 강함. `telegram/send.ts`에 `MAX_CHUNKS_PER_TURN` (모든 트리거 1) hard cap. 6+ 라이브 테스트 1 chunk 일관 ✅.
4. **`c895d17` persona prompt 정리 + 연결 신설 + 날짜 권위 + 다양화** — 258 → 201줄 (22% 감소). chunk 5섹션 → 1, 자율 기록 3섹션 → 1, [캘린더 등록] 제거. `[연결로 똑똑하기]` 신설 (다영의 "2% 부족" 진단 fix), 평가어 차단 추가 ("그게 나쁜 건 아니야" → ✅ "그치"), "오~" tic 차단 (다양화 + ❌ 룰), 날짜 hallucination 차단 ([지금] 권위적 + 어제/내일 미리 계산), "다영이/다영아" 둘 다 OK 명시.

### ⏳ 검증 대기 (내일 06:00~ 자연스러운 대화로)
- 새 prompt + chunk cap 효과 종합:
  - chunk = 1 일관성 유지?
  - "오~" tic 줄어듦?
  - 날짜·요일 정확 ("오늘 토요일/일요일" 제대로)?
  - [연결로 똑똑하기] 효과 (단 데이터 부족으로 한계 있음 — Block 4 누적 후 진가)
  - "다영이/다영아" 자연스럽게 섞임?
  - 평가어 ("그게 나쁜 건 아니야" 류) leak 줄어듦?
  - mirror에서 친구 결로?

### ⏳ 남은 작업

#### Block 4 (깊이) — **다음 차례. Plan 미작성**
- 잠재 관찰 (6h cron) — Claude가 최근 데이터 자체 판단으로 발화/침묵 결정
- daily summary (23:30) + weekly summary (일요일)
- user_profile 누적 — "다영에 대해 알게 된 것" facts 한 줄씩 쌓기
- 회고 모드 깊이 (23:00 retro 트리거) — 현재 chunk 1 cap 때문에 cramp되면 retro만 풀거나 schedule kind별 분기

**Block 4가 [연결로 똑똑하기]의 진짜 데이터 기반.** 현재 24h memory raw만으로는 *연결할 자료* 부족. user_profile + summary가 깔려야 봇이 "맞아 너 며칠 전에 X 썼었잖아" 류 *구체적* 인용 가능.

→ 내일 새 세션은 **brainstorming → plan 작성 → 구현** 흐름. 헤더만 있는 Plan을 task 단위로 상세화부터.

#### Block 3b (캘린더 read/write) — Plan 미작성
3.9~3.14 헤더만. AppleScript Calendar TCC 권한 미해결. 우선순위 낮음.

#### PIN 인증 (별도 spec)
다영 4자리 PIN (iPhone 결). 별도 spec 작성 필요. 봇과 무관, 언제든.

## 별도 followups (큐)

라이브 검증에서 발견된 별도 버그/이슈, 우선순위 낮음 (Block 4 후 또는 별도 spawn task):

1. **schedule 트리거 phantom text replay** — 5/2 8:30 PM에 5/2 3:03 PM 응답 (라땡 만오천원)이 *글자 그대로* 재발신. d157381이 *action* 쪽 phantom만 잡고 *text* 쪽은 못 잡음. Claude가 메모리에서 user 응답을 *fresh info*로 끌어다 다시 응답. fix 방향: schedule 트리거에서 메모리를 read-only context로만 박고 "respond AS IF new"를 prompt에서 더 강하게 차단. 또는 시스템에서 최근 N일 내 같은 텍스트 reply는 drop.
2. **realtime CHANNEL_ERROR 패턴** — 5/1 16:41~ 12+회 CHANNEL_ERROR / SUBSCRIBED 반복 + TIMED_OUT 3연속. 별도 안정성 이슈 — polling fallback 검토 (spec line 3684에서 약속).
3. **병렬 INSERT race condition** — 동시 INSERT 시 핸들러 두 번 발화 → 같은 candidate가 nanosecond 차이로 dedup 통과해서 2번 등록 + Claude 호출 2번. fix 방향: handler 진입에 short debounce 또는 candidate insert 전 상호 exclusion.
4. **`is_table_in_publication()` defense-in-depth** — 마이그레이션에 함수는 정의됐지만 dashboard에 미적용 + 봇 부팅 체크 미구현. 한가할 때.

## 운영 상태

- **봇 PID**: reload할 때마다 바뀜. `launchctl list | grep jieun`
- **로그**: `/Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/logs/bot.log` (회전, mode 600)
- **dev 서버**: 다영이 별도 터미널에서 `npm run dev` (parent app)
- **`.env`**: `jieun-bot/.env` (mode 600) + `.env.local` (parent app, mode 600). gitignored.

## 핵심 결정 (잊지 말 것)

1. **추가 비용 0** — Claude Max 구독 (claude CLI auth via `claude login`).
2. **단일 사용자** — 다영. RLS는 service_role 기반.
3. **Apple Calendar (개인) only** — Google Calendar 업무용 절대 X.
4. **`<actions>` JSON 구조화 출력** — MCP 대신. user 트리거에서만 emit.
5. **페르소나는 *친구*, 챗봇 X** — 카톡 결:
   - 1 chunk default (코드 cap 강제), 짧은 메시지엔 1 chunk 강제
   - 한 chunk 3-4문장 max
   - 쉼표 거의 X (한 메시지 0~1개)
   - 마크다운/강조 따옴표 X
   - 메모리 phantom 재기록 X
   - 감정 분석 X — 같이 느끼기
   - 평가어 X ("좋다/나쁘다", "그게 나쁜 건 아니야" 류)
   - 추임새 다양화 — "오~"로 매 메시지 시작 X
   - 호칭 "다영아" + "다영이" 둘 다 OK
   - 이모지 절제 (🙂 ☘️ ㅠ 가끔)
6. **회고봇은 영감 (인스타 @eunjibak.1 금동이) 5원칙 내재화**:
   1. 침묵의 설계가 발화 설계보다 먼저
   2. 판단 X, 관찰 O
   3. 판단할 땐 반드시 근거와 함께
   4. 회피↔실행 패턴이 진짜 추적 대상
   5. 안 한 날엔 분석 X, 격려

## 다음 세션 첫 turn

1. 이 문서 읽기
2. `git log --oneline | head -10` — 최근 commits 확인
3. `tail -40 jieun-bot/logs/bot.log` — 봇 동작 확인
4. **다영한테 어제 23:00 회고 트리거 + 오늘 새 prompt 적용 후 대화 어땠는지 물어보기.**
   - chunk = 1 일관?
   - "오~" tic 줄어듦?
   - 날짜·요일 정확?
   - [연결] 시도 보임?
   - "다영이~" 자연스러움?
   - 회귀 발견되면 짚어서 fix → 안정되면 Block 4 brainstorming
5. Block 4 시작이면 **brainstorming skill부터** — plan 미작성이라 spec + 회고봇 영감 5원칙 기반으로 task 단위로 풀어내야 함.

## 마지막 commits

```
c895d17 refactor(jieun-bot): persona prompt 정리 + [연결] 신설 + 날짜 권위 + 다양화
684c067 fix(jieun-bot): chunk count regression — 코드 레벨 hard cap
28ed9a0 fix(jieun-bot): event 트리거 error_max_turns — maxTurns 1→3
cb19583 fix(jieun-bot): event 트리거 무발화 — Realtime publication 누락
82e7c8f docs: 세션 핸드오프 문서 — Block 3a 종료 시점
d157381 fix(jieun-bot): Block 3a 라이브 검증 후 보강 — 4 issues
216b419 feat(jieun-bot): event 트리거 통합 — 시그널 5종 + dedup + Claude 발화
```

## 새 세션 운영 노트

- **prompt 다이어트 단계 완료**. 새 회귀가 보이면 *코드*에서 잡는 패턴 우선 (chunk cap이 좋은 사례). prompt 룰만 강화하는 건 Sonnet의 본능보다 약함.
- **봇 reload 명령**:
  ```bash
  launchctl unload -w /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/launchd/kr.daniel.jieun.plist && \
    launchctl load -w /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/launchd/kr.daniel.jieun.plist
  ```
- **테스트 52개**. `npm test -- --run` 빨리 도는 편.
- **`Co-Authored-By: Claude Opus 4.7 (1M context)`** 트레일러 — 시스템 프롬프트 명시 패턴, false-positive security warning 무시 가능.
