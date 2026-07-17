#!/usr/bin/env bash
# budget-sms 생존 감시: cron이 30분마다 실행.
# poll-loop.sh가 매 사이클 갱신하는 heartbeat.txt가 10분 넘게 오래되면
# = 루프가 죽었거나 launchd 잡이 내려간 것 → 알림 + alerts.log 기록.
# chat.db를 읽지 않으므로 cron의 Full Disk Access 없이 동작한다.
set -u

DIR="$HOME/Library/Application Support/budget-sms"
HEARTBEAT="$DIR/heartbeat.txt"

now=$(date +%s)
last=$(cat "$HEARTBEAT" 2>/dev/null || echo 0)
age=$((now - last))

if [ "$age" -gt 600 ]; then
  echo "[heartbeat] $(date -Iseconds) poll-loop 정지 감지 (마지막 heartbeat ${age}초 전)" >> "$DIR/alerts.log"
  osascript -e 'display notification "poll-loop 멈춤 — launchctl kickstart gui/$UID/com.daniel.budget-sms (runbook 참고)" with title "budget-sms"' 2>/dev/null || true
fi
