# budget-sms (맥미니 결제문자 자동 가계부 입력)

설치 / 운영 / 디버깅 가이드: [`docs/operations/budget-sms-runbook.md`](../../../docs/operations/budget-sms-runbook.md)

## 빠른 설치

```bash
bash setup.sh
nano "$HOME/Library/Application Support/budget-sms/secret.env"   # Vercel BUDGET_SMS_SECRET와 동일 값
```

설치 전 `brew install jq sqlite3 curl` (있으면 자동 통과). 설치 후 System Settings → Privacy & Security → Full Disk Access에서 `/bin/bash`, `/usr/bin/sqlite3` 추가.
