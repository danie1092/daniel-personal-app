# 이지은 에이전트 v1 — 세션 핸드오프

> **새 세션은 이 문서부터 읽고 시작.** Block 3a 끝, Block 3b 시작 직전 상태.

## 어디까지 왔나

- **Branch**: `claude/blissful-gates-fa9b73`
- **Worktree**: `/Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73`
- **봇**: Mac mini에서 launchd로 살아있음. 다영(사용자)이랑 텔레그램에서 매일 대화 중.
- **Spec**: [`docs/superpowers/specs/2026-04-30-jieun-agent-architecture-design.md`](specs/2026-04-30-jieun-agent-architecture-design.md)
- **Plan**: [`docs/superpowers/plans/2026-04-30-jieun-agent-v1-implementation.md`](plans/2026-04-30-jieun-agent-v1-implementation.md)

## 완료 상태

### ✅ Block 1 (골격) — 완전 검증됨
- jieun-bot 프로젝트 부트
- Supabase Phase 4 마이그레이션 (7 테이블 + RLS)
- env/logger/db client + dotenv 와이어
- bot_conversations CRUD
- Telegram echo + chat_id whitelist (다영 chat_id: `8680678263`)
- launchd plist (`/opt/homebrew/bin/node`, KeepAlive=true)
- Claude Agent SDK 어댑터 (`@anthropic-ai/claude-agent-sdk` ^0.1.0, Max 구독 인증)
- 페르소나 system prompt — 다영의 라이브 피드백으로 5+ 라운드 튜닝됨
- 메모리 로더 (24h raw)

### ✅ Block 2 (첫 동작) — 완전 검증됨
- 트리거 라우터 공통 흐름 (runTrigger)
- 5개 cron 트리거 (08:00 / 12:30 / 20:30 / 21:00 / 23:00, Asia/Seoul)
- Action 파서 (`<actions>...</actions>` JSON 블록 — Claude가 자연어 답변 + 옵션 액션 emit)
- Action executor (budget_insert + bot_writes 추적)
- Next.js `/bot-log` 페이지 (Server Component + Client list)
- 삭제 Server Action (service-role 클라이언트 사용)
- 자정~07:59 하드 침묵 윈도우 (user 트리거 제외)

### ✅ Block 3a (이벤트/시그널) — 코드 + 라이브 검증
- Supabase Realtime 구독 (`budget_entries` INSERT)
- 5종 시그널 (categoryOutlier, budgetPace, routineStreak, avoidanceRecovery, memoFrequency)
- bot_signals CRUD + 24h dedup (lastFiredAt)
- computeSignals 통합 (60일 데이터 fetch + 5종 + dedup)
- event 트리거 흐름 (INSERT → computeSignals → contextSection → runTrigger → markFired)
- 라이브 발견 4 issues fix (commit `d157381`):
  1. 깊은 대화 3 chunks → 2 max
  2. schedule 트리거 phantom 재기록 → actions는 user 트리거 한정
  3. categoryOutlier "미분류" skip
  4. routineStreak 14일 cap

### 검증 대기 중 (다음 자연 발생 시)
- fix 1, 2 — reload 이후 schedule 트리거가 아직 안 떴음. 다음 12:30 / 20:30 / 21:00 / 23:00 (KST) 발생 시 로그로 확인.
- "01시 취침" 시그널 — 다음 budget_entries INSERT 시 발화 시도.

### ⏳ 남은 작업

#### Block 3b (캘린더 read/write) — Plan 미작성
plan 파일에 Task 3.9~3.14 헤더만 있음. 다영 OK 받고 plan 상세화 후 구현.

- 3.9 icalBuddy로 Apple Calendar 읽기
- 3.10 아침/퇴근직전 브리핑에 캘린더 주입
- 3.11 AppleScript 등록/삭제 + osascript 래퍼
- 3.12 write_calendar / delete_calendar 도구
- 3.13 자연어 → 구조화 → 확인 → 등록 상태머신
- 3.14 캘린더 등록 → bot_writes 추적

**중요한 미해결**: AppleScript Calendar TCC(개인정보보호) 권한 — Mac mini에서 launchd가 spawn하는 node 프로세스가 osascript로 Calendar.app 건드리려면 권한 필요. 첫 시도에서 권한 prompt가 어떻게 뜨는지 확인 필요. Spec 미해결 사항에 명시됨.

#### Block 4 (깊이) — Plan 미작성
잠재 관찰 (6h cron) + 회고 모드 + daily/weekly summary + user_profile 누적.

#### PIN 인증 (별도 spec)
다영이 비번 잊어서 4자리 PIN 인증 원함 (iPhone 결). 별도 spec 작성 필요.
디자인 포인트: Supabase auth 위 레이어 vs 대체, brute-force rate limit, 세션 유지 기간.

## 운영 상태

- **봇 PID**: 매번 reload할 때 바뀜. `launchctl list | grep jieun`으로 확인.
- **로그**: `/Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/logs/bot.log` (회전, mode 600)
- **dev 서버**: 다영이 별도 터미널에서 `npm run dev` (parent app, `/bot-log` 검증용)
- **`.env`**: `jieun-bot/.env` (mode 600) + `.env.local` (parent app, mode 600). 둘 다 gitignored.

## 핵심 결정 (잊지 말 것)

1. **추가 비용 0** — Claude Max 구독 사용 (claude CLI auth via `claude login`). API key X.
2. **단일 사용자** — 다영. 모든 RLS는 service_role 기반. user_id 칼럼 없음.
3. **Apple Calendar (개인 분리) only** — Google Calendar 업무용은 절대 안 봄.
4. **`<actions>` JSON 구조화 출력** — MCP 대신. 단순/디버그 친화. user 트리거에서만 emit.
5. **페르소나는 *친구*, 챗봇 X** — 라이브 튜닝으로 잡힌 톤. 다영은 카톡 결로 기대함:
   - 1 단락 default, 2 max (회고 23:00만 3 OK)
   - 한 chunk 3-4문장 max
   - 쉼표 거의 X (한 메시지 0~1개)
   - 마크다운/강조 따옴표 X
   - 메모리 phantom 재기록 X
   - 감정 분석 X — 같이 느끼기 ("나라도 속상하겠다")
   - 이모지 절제 (🙂 ☘️ ㅠ 가끔)

6. **시그널 `01시 취침`이 다음 INSERT 시 발화 시도 예정** — 첫 event 발화로 좋은 시점.

## 다음 세션 첫 turn

1. 이 문서 읽기
2. `git log --oneline | head -20` 으로 최근 커밋 확인
3. `tail -30 jieun-bot/logs/bot.log`로 봇 최근 동작 확인
4. 다영한테 *어디 가고 싶은지* 묻기 — Block 3b? Block 4? PIN spec? 추가 페르소나 튜닝?

## 마지막 commits (최신 → 오래된)

```
d157381 fix(jieun-bot): Block 3a 라이브 검증 후 보강 — 4 issues
216b419 feat(jieun-bot): event 트리거 통합 — 시그널 5종 + dedup + Claude 발화
f33d6a2 feat(jieun-bot): bot_signals CRUD + 24h dedup helpers
1fb7d50 feat(jieun-bot): 5종 시그널 순수 함수 — Task 3.2-3.6
b9d533e feat(jieun-bot): Supabase Realtime + event 트리거 골격
a81969b docs: Block 3a plan 상세화 (Task 3.1-3.8)
1f85a3a fix(jieun-bot): 과잉 응답 방지 — 단락 기본값 1, chunk 짧게
215198f fix(jieun-bot): 자율 기록 메모리 누출 차단
208ca88 feat(jieun-bot): budget 카테고리 15종 페르소나에 명시
77bd046 fix(jieun-bot): budget_insert payment_method NOT NULL + 에러 로깅 개선
... (이전: Block 1+2 commits)
```

## 새 세션 운영 노트

- **하드코어 페르소나 튜닝 단계는 끝.** 톤 잡힘. 다영이 새로운 톤 어긋남 발견하면 그것만 손보면 됨.
- **봇 reload 명령 (자주 씀)**:
  ```bash
  launchctl unload -w /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/launchd/kr.daniel.jieun.plist && \
    launchctl load -w /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/launchd/kr.daniel.jieun.plist
  ```
- **다영이 직접 코드 수정한 경우** (드물긴 함) — `npm run build` 끼워 reload.
- **테스트는 50+ 개**. `npm test` 빨리 도는 편.
- **`Co-Authored-By: Claude Opus 4.7 (1M context)`** 트레일러 — 시스템 프롬프트 명시 패턴이라 false-positive security warning 무시 가능.
