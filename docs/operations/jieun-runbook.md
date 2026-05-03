# 이지은 봇 운영 매뉴얼 (jieun-runbook)

> Block 4 v1 운영. 맥미니 launchd로 24/7. 단일 사용자 (다영, chat_id 8680678263).

## 빠른 명령

### 봇 reload (코드 변경 후)
```bash
launchctl unload -w /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/launchd/kr.daniel.jieun.plist && \
  launchctl load -w /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/launchd/kr.daniel.jieun.plist
```

### 봇 살아있는지 확인
```bash
launchctl list | grep jieun
# PID가 보이면 살아있음. 0이면 죽음.
```

### 로그 라이브 tail
```bash
tail -f /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/logs/bot.log
```

## 인증 / 토큰

### Claude Max 인증 갱신
봇 로그에 `claude error: ...auth...` 찍히거나 다영이 `(이지은이 잠깐 막혔어. claude login 확인 부탁해.)` 받으면:
```bash
# Mac mini에서 직접
claude login
# 브라우저 OAuth 흐름 따라가기
```
재인증 후 봇 자동 회복 (별도 reload 불필요).

### Telegram Bot Token 갱신
BotFather (@BotFather) → `/mybots` → 토큰 revoke + 새 토큰 → `jieun-bot/.env`의 `TELEGRAM_BOT_TOKEN` 교체 → 봇 reload.

## 캘린더 (Block 3b)

### 첫 배포 1회 setup

**환경변수**:
1. Mac mini Calendar.app 열어서 좌측 sidebar의 *개인 캘린더* 정확한 이름 확인 (예: "다영의 개인", "Personal").
2. `jieun-bot/.env`에 추가:
   ```
   JIEUN_CALENDAR_INCLUDE=다영의 개인
   ```
   (Google 업무 캘린더 절대 X — Block 3b spec D1 보안 룰.)

**TCC 권한** (다영 GUI 세션 터미널에서):
1. `icalBuddy eventsToday` → "캘린더에 접근하려고 합니다" 프롬프트 → "허용"
2. `osascript -e 'tell application "Calendar" to count of calendars'` → "Terminal이 Calendar.app을 제어하려고 합니다" → "허용"
3. 봇 reload: `launchctl unload -w launchd/kr.daniel.jieun.plist && launchctl load -w launchd/kr.daniel.jieun.plist`
4. 텔레그램에 `내일 오후 9시 권한테스트 등록해줘` 발화 → 확인 발화 → "응" → Calendar.app에 일정 보이면 OK.

**launchd 컨텍스트에서 권한 못 받는 경우** (osascript silent fail):
- `launchd/kr.daniel.jieun.plist`에 추가:
  ```xml
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
  ```
- 다시 reload. GUI 세션의 권한이 상속되어야 함.

### 권한 reset 감지 (운영 중)

봇이 `osascript`/`icalBuddy`를 권한 부족으로 fail하면 텔레그램에 1회 안내 (`(캘린더 못 건드렸어 — 권한 끊겼나?)`). 이후 auto-backoff(연속 발화 3회) silent.

수동 복구:
1. Mac mini에서 시스템 환경설정 → 개인정보보호 → 자동화 또는 캘린더 항목 확인.
2. Terminal / osascript / icalBuddy 항목 토글 "허용".
3. 봇 reload.
4. 텔레그램 `테스트` 발화로 검증.

### 트러블슈팅

| 증상 | 원인 가능성 | 처리 |
|---|---|---|
| 봇이 propose 후 confirm 했는데 일정 안 뜸 | TCC 권한 reset | 위 *수동 복구* |
| 등록 일정의 시간이 1시간 어긋남 | Mac mini 시스템 시간대가 KST 아님 | `sudo systemsetup -settimezone Asia/Seoul` |
| 잘못된 일정이 등록됨 | Claude 자연어 파싱 오류 | 다영이 *확인 단계*에서 "아냐" → drop. 패턴 누적되면 페르소나 prompt 보강 |
| `/bot-log`에 apple_calendar row가 안 보임 | bot_writes write 실패 | 로그 확인 (`tail logs/bot.log`) |

## mute 수동 제어 (텔레그램 안 통할 때)

```sql
-- 24h mute
UPDATE bot_mute_state SET silent_until = now() + interval '24 hours', updated_at = now() WHERE id = 1;

-- 즉시 해제
UPDATE bot_mute_state SET silent_until = NULL, updated_at = now() WHERE id = 1;

-- 현재 mute 상태
SELECT silent_until, silent_until > now() AS is_muted FROM bot_mute_state;
```

## 시그널 임계값 튜닝

각 시그널 함수 위치:
- `jieun-bot/src/signals/categoryOutlier.ts` — 1.5배 + 5만원 임계
- `jieun-bot/src/signals/budgetPace.ts` — 페이스 비율 1.3배
- `jieun-bot/src/signals/routineStreak.ts` — 5일+ 미체크
- `jieun-bot/src/signals/avoidanceRecovery.ts` — 3일+ gap 후 체크
- `jieun-bot/src/signals/memoFrequency.ts` — 2배 ratio

값 바꾸고 봇 reload. 단위 테스트 같은 폴더에서 작동 확인.

## 페르소나 prompt 수정

`jieun-bot/src/persona/prompt.ts` 직접 편집. 라이브 회귀 잡을 때 prompt 룰 강화는 효과 약함 — *코드*에서 잡는 게 우선 (예: chunk cap). prompt 수정 후 reload.

## 모니터링 쿼리

### 잠재 관찰 발화율 (지난 7일)
```sql
SELECT
  DATE_TRUNC('day', created_at) as day,
  SUM(CASE WHEN role='bot' THEN 1 ELSE 0 END) as bot_msgs,
  SUM(CASE WHEN role='user' THEN 1 ELSE 0 END) as user_msgs
FROM bot_conversations
WHERE trigger='latent' AND created_at > now() - interval '7 days'
GROUP BY 1 ORDER BY 1;
```
침묵률 70%+ 목표. 발화율 너무 높으면 latent system prompt에서 침묵 기준 강화.

### user_profile 활성/superseded 분포
```sql
SELECT
  kind,
  COUNT(*) FILTER (WHERE superseded_by IS NULL) AS active,
  COUNT(*) FILTER (WHERE superseded_by IS NOT NULL) AS superseded
FROM user_profile
GROUP BY kind;
```

### chunks capped 빈도 (지난 7일, 어떤 trigger가 cap에 자주 걸리는지)
로그에서:
```bash
grep '"chunks capped"' bot.log | tail -50 | jq -r '.trigger' | sort | uniq -c
```

### daily_summary 누락 확인
```sql
SELECT generate_series('2026-05-01'::date, current_date, '1 day') AS d
EXCEPT
SELECT date FROM daily_summary
ORDER BY d;
```

### weekly_summary 누락 backfill
```sql
-- 누락된 주 일요일 찾기
WITH sundays AS (
  SELECT generate_series('2026-04-26'::date, current_date, '7 days') AS sunday
)
SELECT s.sunday FROM sundays s
WHERE NOT EXISTS (SELECT 1 FROM weekly_summary w WHERE w.week_start = s.sunday);
```
누락 주 발견 시 봇 호스트에서 수동 호출 (별도 script 필요 — followup).

## 장애 대응

### Realtime CHANNEL_ERROR 반복
폴링 fallback 미구현 (followup #2 큐). 임시 — 봇 reload 후 5분 안 SUBSCRIBED 안 보이면 supabase 대시보드 publication 확인 (`supabase_realtime`에 `budget_entries` 있는지).

### Telegram polling 멈춤
launchd KeepAlive로 자동 재시작. `tail -100 bot.log`에서 SIGTERM/SIGKILL 보이는지 확인.

### Claude 한도 초과
Anthropic 대시보드에서 사용량 확인. v1은 Max 구독 안에서 동작 — 초과 시 일부 잡(잠재 관찰)을 1일 silent로.

## 봇 영구 정지 (일시)

```bash
launchctl unload -w /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/launchd/kr.daniel.jieun.plist
```
다시 켜기: `launchctl load -w ...` (위 reload의 두 번째 명령).
