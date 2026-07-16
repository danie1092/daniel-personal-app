#!/usr/bin/env bash
# budget-sms watchdog: poll.sh가 조용히 멈췄는지 감시. launchd가 6시간마다 실행.
#
# 원리: poll.sh가 정상이면 "처리 대상 문자"(poll.sh의 SELECT 조건과 동일)는
# 도착 후 30초 안에 state가 그 ROWID를 지나간다. 도착한 지 1시간이 지났는데
# 아직 state 뒤에 남아있는 문자가 있으면 = poll이 죽었거나 막힌 것 → macOS 알림.
#
# 2026-07-16 사건(chat.db 저장 방식 변경으로 조용히 0건 수집) 재발 시
# 며칠 뒤가 아니라 당일에 알아채기 위한 장치.

set -euo pipefail

DIR="$HOME/Library/Application Support/budget-sms"
STATE="$DIR/state.txt"
CHAT_DB="$HOME/Library/Messages/chat.db"

LAST_ROWID=0
[ -f "$STATE" ] && LAST_ROWID=$(cat "$STATE")

# poll.sh의 후보 선택 조건과 동일해야 함 (poll.sh 수정 시 여기도 맞출 것)
PENDING=$(sqlite3 -readonly "$CHAT_DB" \
  "SELECT COUNT(*) FROM message
    WHERE ROWID > $LAST_ROWID
      AND (
            (text LIKE '%승인%' AND text LIKE '%원%')
         OR (text IS NULL AND attributedBody IS NOT NULL)
      )
      AND (date/1000000000 + 978307200) < (strftime('%s','now') - 3600);" 2>/dev/null) || {
  echo "[watchdog] $(date -Iseconds) sqlite3 실패 (chat.db 권한?)" >&2
  exit 0
}

if [ "${PENDING:-0}" -gt 0 ]; then
  osascript -e "display notification \"미처리 문자 ${PENDING}건 (1시간+) — poll.sh 점검 필요, runbook 참고\" with title \"budget-sms watchdog\"" || true
  echo "[watchdog] $(date -Iseconds) pending=$PENDING state=$LAST_ROWID" >&2
fi
