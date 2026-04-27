#!/usr/bin/env bash
# budget-sms poll: chat.db에서 신규 결제 SMS를 잡아 Vercel API에 POST.
# launchd가 30초마다 실행. 출력은 stdout/stderr에 → launchd log.

set -euo pipefail

DIR="$HOME/Library/Application Support/budget-sms"
STATE="$DIR/state.txt"
SECRET_FILE="$DIR/secret.env"
FAILED_PARSES_LOG="$DIR/failed-parses.log"
FAILED_NETWORK_LOG="$DIR/failed-network.log"
RETRY_COUNT_FILE="$DIR/retry-count.txt"

API_URL="${BUDGET_SMS_API_URL:-https://daniel-personal-app.vercel.app/api/budget/auto}"
CHAT_DB="$HOME/Library/Messages/chat.db"

# secret 읽기
if [ ! -f "$SECRET_FILE" ]; then
  echo "[budget-sms] secret.env 없음 → setup.sh 먼저 실행" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$SECRET_FILE"
if [ -z "${BUDGET_SMS_SECRET:-}" ]; then
  echo "[budget-sms] BUDGET_SMS_SECRET 비어있음" >&2
  exit 1
fi

# state 읽기
LAST_ROWID=0
if [ -f "$STATE" ]; then
  LAST_ROWID=$(cat "$STATE")
fi

# 결제 SMS 후보 조회 (본문에 '승인' AND '원')
# text 내 newline/CR을 literal \n / 빈 문자로 치환 — IFS='|' read가 깨지지 않게.
# bash에서 printf '%b'로 \n을 실제 개행으로 복원.
ROWS=$(sqlite3 -readonly "$CHAT_DB" \
  "SELECT ROWID, date,
          REPLACE(REPLACE(COALESCE(text, ''), char(13), ''), char(10), '\\n')
     FROM message
    WHERE ROWID > $LAST_ROWID
      AND text IS NOT NULL
      AND text LIKE '%승인%'
      AND text LIKE '%원%'
    ORDER BY ROWID ASC
    LIMIT 50;" 2>/dev/null) || {
  echo "[budget-sms] sqlite3 실패 (chat.db 락 또는 권한 부족)" >&2
  exit 0  # 다음 폴링에서 재시도
}

if [ -z "$ROWS" ]; then
  exit 0
fi

# 행마다 처리: ROWID|date|text
echo "$ROWS" | while IFS='|' read -r rowid msg_date_ns rest; do
  # rest는 text. SQL에서 \n으로 치환됐으니 printf '%b'로 복원
  text=$(printf '%b' "$rest")

  # Apple epoch (2001-01-01 UTC) ns → ms (Unix epoch)
  # 2001-01-01 = 978307200 (sec since 1970)
  sms_date_ms=$(( (msg_date_ns / 1000000) + 978307200000 ))

  # POST
  http_code=$(curl -sS -o /tmp/budget-sms-resp.txt -w "%{http_code}" \
    -X POST "$API_URL" \
    -H "Authorization: Bearer $BUDGET_SMS_SECRET" \
    -H "Content-Type: application/json" \
    --data "$(jq -n --arg t "$text" --argjson d "$sms_date_ms" '{raw_text:$t, sms_date_ms:$d}')" \
    --max-time 10 || echo "000")

  case "$http_code" in
    201|409)
      # 정상 (신규 또는 이미 처리됨) → state 갱신
      echo "$rowid" > "$STATE"
      rm -f "$RETRY_COUNT_FILE"
      ;;
    422)
      # 파싱 실패 → 로그 + state 갱신 (재시도 의미 없음)
      {
        echo "=== $(date -Iseconds) | rowid=$rowid ==="
        echo "$text"
        echo
      } >> "$FAILED_PARSES_LOG"
      chmod 600 "$FAILED_PARSES_LOG"
      echo "$rowid" > "$STATE"
      ;;
    400)
      # 잘못된 입력 (4KB 초과 등) → 로그 + state 갱신
      {
        echo "=== $(date -Iseconds) | rowid=$rowid | 400 bad request ==="
        echo "${text:0:200}..."
        echo
      } >> "$FAILED_PARSES_LOG"
      chmod 600 "$FAILED_PARSES_LOG"
      echo "$rowid" > "$STATE"
      ;;
    401)
      # 인증 실패 → 즉시 중단 + 알림
      osascript -e 'display notification "BUDGET_SMS_SECRET 인증 실패 — secret 확인 필요" with title "budget-sms"' || true
      echo "[budget-sms] 401 — 중단" >&2
      exit 1
      ;;
    429)
      # rate limit → retry-after 따라 sleep, state 진행 안 함
      retry=$(grep -i 'retry-after' /tmp/budget-sms-resp.txt | awk '{print $2}' | tr -d '\r' || echo 60)
      sleep "${retry:-60}" || true
      # 다음 폴링에서 재시도
      ;;
    000|5*)
      # 네트워크 또는 서버 오류 → state 진행 안 함, 재시도 카운터 증가
      cnt=$(cat "$RETRY_COUNT_FILE" 2>/dev/null || echo 0)
      cnt=$((cnt + 1))
      if [ "$cnt" -ge 3 ]; then
        {
          echo "=== $(date -Iseconds) | rowid=$rowid | http=$http_code (3회 실패 skip) ==="
          echo "${text:0:200}..."
          echo
        } >> "$FAILED_NETWORK_LOG"
        chmod 600 "$FAILED_NETWORK_LOG"
        echo "$rowid" > "$STATE"
        rm -f "$RETRY_COUNT_FILE"
      else
        echo "$cnt" > "$RETRY_COUNT_FILE"
      fi
      ;;
    *)
      echo "[budget-sms] 예상 못 한 응답 코드: $http_code" >&2
      ;;
  esac

  # 로그 회전 (100KB 초과 시)
  for log in "$FAILED_PARSES_LOG" "$FAILED_NETWORK_LOG"; do
    if [ -f "$log" ] && [ "$(stat -f%z "$log")" -gt 102400 ]; then
      # *.1 ~ *.5 까지만 보존
      [ -f "$log.4" ] && mv "$log.4" "$log.5"
      [ -f "$log.3" ] && mv "$log.3" "$log.4"
      [ -f "$log.2" ] && mv "$log.2" "$log.3"
      [ -f "$log.1" ] && mv "$log.1" "$log.2"
      mv "$log" "$log.1"
      touch "$log"
      chmod 600 "$log"
    fi
  done
done
