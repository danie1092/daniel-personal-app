#!/usr/bin/env bash
# budget-sms poll: chat.db에서 신규 결제 SMS를 잡아 Vercel API에 POST.
# launchd가 30초마다 실행. 출력은 stdout/stderr에 → launchd log.
#
# 본문 위치가 두 가지다:
#   - text 컬럼 (구형)
#   - attributedBody BLOB (typedstream) — macOS가 text를 NULL로 두는 경우.
#     2026-07-16부터 모든 수신 문자가 이 형태로만 들어와 폴백 디코더 추가.

set -euo pipefail

# launchd/cron 어느 쪽에서 불려도 동일하게 동작하도록 PATH 고정 (jq 등)
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin"

DIR="$HOME/Library/Application Support/budget-sms"
STATE="$DIR/state.txt"
SECRET_FILE="$DIR/secret.env"
FAILED_PARSES_LOG="$DIR/failed-parses.log"
FAILED_NETWORK_LOG="$DIR/failed-network.log"
FAILED_DECODES_LOG="$DIR/failed-decodes.log"
RETRY_COUNT_FILE="$DIR/retry-count.txt"
NOTIFY_STAMP="$DIR/last-notify.txt"

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

# 동시 실행 방지 락 — launchd(30초)와 cron 백스톱(60초)이 겹쳐도 한쪽만 돈다.
# 정상 실행은 2분 내 끝남 → 10분 넘게 남아있는 락은 죽은 프로세스 잔재로 보고 회수.
LOCK_DIR="$DIR/poll.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  if [ -n "$(find "$LOCK_DIR" -maxdepth 0 -mmin +10 2>/dev/null)" ]; then
    rmdir "$LOCK_DIR" 2>/dev/null || true
    mkdir "$LOCK_DIR" 2>/dev/null || exit 0
  else
    exit 0
  fi
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

# state 읽기
LAST_ROWID=0
if [ -f "$STATE" ]; then
  LAST_ROWID=$(cat "$STATE")
fi

# attributedBody(typedstream) hex → 본문 텍스트. 실패 시 빈 문자열.
decode_body() {
  python3 -c '
import sys
data = bytes.fromhex(sys.argv[1])
i = data.find(b"NSString")
if i < 0: sys.exit(0)
i = data.find(b"+", i)
if i < 0: sys.exit(0)
i += 1
b0 = data[i]
if b0 == 0x81:
    ln = int.from_bytes(data[i+1:i+3], "little"); i += 3
elif b0 == 0x82:
    ln = int.from_bytes(data[i+1:i+5], "little"); i += 5
else:
    ln = b0; i += 1
sys.stdout.write(data[i:i+ln].decode("utf-8", "replace"))
' "$1" 2>/dev/null || true
}

# 같은 알림은 6시간에 1번만 (30초 폴링이라 스팸 방지)
notify_throttled() {
  local now last
  now=$(date +%s)
  last=$(cat "$NOTIFY_STAMP" 2>/dev/null || echo 0)
  if [ $((now - last)) -ge 21600 ]; then
    osascript -e "display notification \"$1\" with title \"budget-sms\"" || true
    echo "$now" > "$NOTIFY_STAMP"
  fi
}

# 결제 SMS 후보 조회.
#  - text가 있으면 SQL에서 바로 필터 ('승인' AND '원')
#  - text가 NULL이면 attributedBody를 hex로 뽑아 bash에서 디코드 후 필터
# text 내 newline/CR을 literal \n / 빈 문자로 치환 — IFS='|' read가 깨지지 않게.
# hex는 [0-9A-F]뿐이라 구분자 안전 → text(rest)보다 앞 컬럼에 둔다.
ROWS=$(sqlite3 -readonly "$CHAT_DB" \
  "SELECT ROWID, date,
          CASE WHEN text IS NULL THEN hex(attributedBody) ELSE '' END,
          REPLACE(REPLACE(COALESCE(text, ''), char(13), ''), char(10), '\\n')
     FROM message
    WHERE ROWID > $LAST_ROWID
      AND (
            (text LIKE '%승인%' AND text LIKE '%원%')
         OR (text IS NULL AND attributedBody IS NOT NULL)
      )
    ORDER BY ROWID ASC
    LIMIT 50;" 2>/dev/null) || {
  echo "[budget-sms] sqlite3 실패 (chat.db 락 또는 권한 부족)" >&2
  exit 0  # 다음 폴링에서 재시도
}

if [ -z "$ROWS" ]; then
  exit 0
fi

# 행마다 처리: ROWID|date|hex|text
echo "$ROWS" | while IFS='|' read -r rowid msg_date_ns body_hex rest; do
  if [ -n "$body_hex" ]; then
    text=$(decode_body "$body_hex")
    if [ -z "$text" ]; then
      # attributedBody가 있는데 본문을 못 뽑음 = 저장 포맷이 또 바뀌었을 가능성.
      # 파이프라인은 막지 않되(state 진행) 로그 + 알림으로 즉시 드러낸다.
      echo "=== $(date -Iseconds) | rowid=$rowid | decode 실패 ===" >> "$FAILED_DECODES_LOG"
      chmod 600 "$FAILED_DECODES_LOG"
      notify_throttled "attributedBody 디코딩 실패 — 포맷 변경 가능성 (failed-decodes.log 확인)"
      echo "$rowid" > "$STATE"
      continue
    fi
    # 결제 문자가 아니면(광고·인증 등) state만 진행하고 통과
    case "$text" in
      *승인*원*|*원*승인*) ;;
      *)
        echo "$rowid" > "$STATE"
        continue
        ;;
    esac
  else
    # rest는 text. SQL에서 \n으로 치환됐으니 printf '%b'로 복원
    text=$(printf '%b' "$rest")
  fi

  # Apple epoch (2001-01-01 UTC) ns → ms (Unix epoch)
  # 2001-01-01 = 978307200 (sec since 1970)
  sms_date_ms=$(( (msg_date_ns / 1000000) + 978307200000 ))

  # POST
  # -D로 헤더를 별도 파일에 dump (retry-after 파싱 위해). -o는 body만 받음.
  http_code=$(curl -sS -D /tmp/budget-sms-headers.txt -o /tmp/budget-sms-resp.txt -w "%{http_code}" \
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
      # rate limit → retry-after(헤더) 따라 sleep 후 이번 배치 중단.
      # (뒤 행을 계속 처리하면 성공한 행이 state를 이 행 너머로 밀어버림)
      retry=$(grep -i '^retry-after:' /tmp/budget-sms-headers.txt | awk '{print $2}' | tr -d '\r')
      sleep "${retry:-60}" || true
      break
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
        # state를 밀지 않고 다음 폴링에서 이 행부터 재시도
        break
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
