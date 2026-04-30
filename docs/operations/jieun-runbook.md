# 이지은 봇 운영 매뉴얼

## 시작 / 중지

```bash
# 빌드 (TS → dist)
cd jieun-bot && npm run build

# launchd 등록 + 시작
launchctl load -w jieun-bot/launchd/kr.daniel.jieun.plist

# 중지
launchctl unload -w jieun-bot/launchd/kr.daniel.jieun.plist

# 재시작 (코드 업데이트 후)
launchctl unload -w jieun-bot/launchd/kr.daniel.jieun.plist
cd jieun-bot && npm run build
launchctl load -w jieun-bot/launchd/kr.daniel.jieun.plist
```

상태 확인:
```bash
launchctl list | grep jieun
# kr.daniel.jieun → 떠 있으면 OK (PID + exit code)
```

## 로그 확인

```bash
# 봇 자체 로그 (회전, mode 600)
tail -f jieun-bot/logs/bot.log

# launchd가 캡처하는 stdout/stderr
tail -f jieun-bot/logs/launchd.out.log
tail -f jieun-bot/logs/launchd.err.log
```

회전 정책: 봇 로그(`bot.log`)는 100KB 도달 시 `.1`~`.5`로 시프트, `.5`는 폐기. launchd가 캡처하는 out/err는 회전 X — 너무 커지면 수동으로 비우거나 logrotate.

## 환경변수

`jieun-bot/.env` (mode 600, gitignore). 필수 키:

| 키 | 값 | 출처 |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | 봇 토큰 | BotFather에서 `/newbot` |
| `TELEGRAM_OWNER_CHAT_ID` | 다영 chat id | 봇한테 `/start` 보낸 후 `https://api.telegram.org/bot<TOKEN>/getUpdates`의 `chat.id` |
| `SUPABASE_URL` | 프로젝트 URL | Supabase 대시보드 → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role secret | 같은 페이지의 `service_role` 키 |
| `LOG_DIR` | 로그 디렉토리 (기본 `./logs`) | 선택 |

## 점검 항목 (장애 시)

1. **`launchctl list | grep jieun`** — 프로세스 떠 있나? 비어 있으면 unload된 거.
2. **로그에 ECONNRESET / 401 / 429** — 토큰 / 인증 / 레이트 리밋 문제.
3. **봇이 메시지에 답 안 함** → Supabase에서 `SELECT * FROM bot_conversations ORDER BY created_at DESC LIMIT 5`로 user 메시지가 들어왔는지 확인. 들어왔는데 bot row가 없으면 핸들러 단계 문제.
4. **Claude 인증 만료** (Task 1.7 이후): 봇이 텔레그램으로 `(이지은이 잠깐 막혔어. 'claude login' 확인 부탁해.)` 같은 알림. 맥미니에서 `claude login` 재실행.
5. **launchd가 throttle 중** — `ThrottleInterval=10`이라 10초 안에 두 번 죽으면 잠시 멈춤. 로그에 `Throttling respawn` 보임.

## 미정 / 후속 (Block 진행하며 보강)

- launchd plist의 `WorkingDirectory`는 현재 worktree 경로. 봇이 main 브랜치로 머지된 후엔 stable한 경로로 옮기고 plist 업데이트 필요.
- Claude Max 한도 모니터링 (Block 4 Task 4.14에서 추가).
- 배포/업데이트 자동화 스크립트 (현재는 수동 build + reload).
