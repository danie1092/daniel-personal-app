# jieun-bot

이지은 — 다영의 텔레그램 에이전트.

## 운영
- 시작: `launchctl load launchd/kr.daniel.jieun.plist`
- 중지: `launchctl unload launchd/kr.daniel.jieun.plist`
- 로그: `tail -f logs/bot.log`
- 인증 갱신: `claude login` (Max 구독 — 토큰 만료 시 봇이 텔레그램으로 알림)

## 개발
- `npm run dev` — tsx watch (로컬 로딩)
- `npm test` — vitest

자세한 운영 매뉴얼: [`docs/operations/jieun-runbook.md`](../docs/operations/jieun-runbook.md)
