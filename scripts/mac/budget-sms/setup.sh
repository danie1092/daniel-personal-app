#!/usr/bin/env bash
# budget-sms 초기 설치 / 재설치 스크립트.
# 사용: bash setup.sh
set -euo pipefail

DIR="$HOME/Library/Application Support/budget-sms"
PLIST_SRC="$(dirname "$0")/com.daniel.budget-sms.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.daniel.budget-sms.plist"

mkdir -p "$DIR"

# 0) 의존성 체크
for cmd in sqlite3 curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[setup] '$cmd' 명령이 없습니다. 'brew install $cmd'로 설치 후 재실행." >&2
    exit 1
  fi
done

# 1) Full Disk Access 안내
cat <<MSG

=== budget-sms 설치 ===

이 스크립트는 다음을 합니다:
  1) ~/Library/Application Support/budget-sms/ 디렉터리 준비
  2) launchd plist 설치 + 로드 (30초 주기로 poll.sh 실행)
  3) state.txt 초기화 (현재 chat.db 최대 ROWID = 과거 메시지 무시)
  4) secret.env 템플릿 생성
  5) Time Machine 백업 제외 등록

** 시작 전 필요한 것 **
  - System Settings → Privacy & Security → Full Disk Access 에서
    /bin/sh, /usr/bin/sqlite3, 그리고 사용 중인 터미널 앱(또는 launchd)에 권한 부여.
  - Vercel 대시보드에서 BUDGET_SMS_SECRET, DEFAULT_USER_ID, SUPABASE_SERVICE_ROLE_KEY 환경변수 등록.

계속하려면 Enter, 중단하려면 Ctrl+C.
MSG
read -r _

# 2) 스크립트 복사 (있으면 갱신)
for f in poll.sh poll-loop.sh watchdog.sh check-heartbeat.sh; do
  cp "$(dirname "$0")/$f" "$DIR/$f"
  chmod 700 "$DIR/$f"
done

# 3) state.txt 초기화 (최초 1회만)
if [ ! -f "$DIR/state.txt" ]; then
  MAX_ROWID=$(sqlite3 -readonly "$HOME/Library/Messages/chat.db" "SELECT COALESCE(MAX(ROWID), 0) FROM message;" 2>/dev/null || echo 0)
  echo "$MAX_ROWID" > "$DIR/state.txt"
  echo "[setup] state.txt 초기화: $MAX_ROWID"
fi

# 4) secret.env 템플릿 (있으면 건너뜀)
if [ ! -f "$DIR/secret.env" ]; then
  cat > "$DIR/secret.env" << ENV
# budget-sms secret. mode 600. Time Machine 제외됨.
# Vercel 환경변수 BUDGET_SMS_SECRET와 동일한 값으로 채울 것.
export BUDGET_SMS_SECRET=""
# (선택) API URL override
# export BUDGET_SMS_API_URL="https://daniel-personal-app.vercel.app/api/budget/auto"
ENV
  chmod 600 "$DIR/secret.env"
  echo "[setup] secret.env 템플릿 생성됨 — 값 채울 것: $DIR/secret.env"
fi

# 5) Time Machine 제외
tmutil addexclusion "$DIR/secret.env" 2>/dev/null || true

# 6) plist 설치 — KeepAlive 장수 프로세스 (poll-loop.sh가 poll 30초 + watchdog 6시간 담당)
# legacy launchctl load/unload는 쓰지 않는다. bootout/bootstrap(gui 도메인)이 정식 방법.
# bootstrap 직후 kickstart: launchd가 신규 스폰을 보류하는 상태(OS 업데이트 재시동 대기)
# 에서도 kickstart 직접 스폰은 먹히므로, 그 상태에서 설치해도 즉시 돌기 시작한다.
UID_N=$(id -u)
mkdir -p "$HOME/Library/LaunchAgents"
sed "s|__HOME__|$HOME|g" "$PLIST_SRC" > "$PLIST_DST"
launchctl bootout "gui/$UID_N/com.daniel.budget-sms" 2>/dev/null || true
launchctl bootstrap "gui/$UID_N" "$PLIST_DST"
launchctl kickstart "gui/$UID_N/com.daniel.budget-sms" 2>/dev/null || true
echo "[setup] launchd agent 등록 완료: $PLIST_DST"

# (구버전 정리) watchdog은 이제 poll-loop 안에서 돌므로 별도 agent 제거
launchctl bootout "gui/$UID_N/com.daniel.budget-sms-watchdog" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.daniel.budget-sms-watchdog.plist"

# 7) cron 생존 감시 (30분 주기)
# poll-loop가 남기는 heartbeat.txt가 오래되면 알림. chat.db를 읽지 않으므로
# cron에 Full Disk Access가 없어도 동작한다. (cron으로 poll 자체를 돌리는 건
# TCC 때문에 불가 — chat.db 접근 거부됨.)
CRON_HEARTBEAT="*/30 * * * * /bin/bash \"$DIR/check-heartbeat.sh\" >> \"$DIR/cron.log\" 2>&1"
( crontab -l 2>/dev/null | grep -v "budget-sms/poll.sh" | grep -v "budget-sms/watchdog.sh" | grep -v "budget-sms/check-heartbeat.sh"
  echo "$CRON_HEARTBEAT" ) | crontab -
echo "[setup] cron 생존 감시 등록 완료 (30분 주기 heartbeat 체크)"

# 8) poll-loop가 실제로 도는지 검증 (heartbeat 갱신 확인)
echo "[setup] poll-loop 기동 검증 중 (최대 40초)..."
OK=""
for _ in $(seq 1 8); do
  sleep 5
  HB=$(cat "$DIR/heartbeat.txt" 2>/dev/null || echo 0)
  if [ $(( $(date +%s) - HB )) -le 60 ]; then OK=1; break; fi
done
if [ -n "$OK" ]; then
  echo "[setup] poll-loop 정상 기동 (heartbeat 갱신 확인)"
else
  cat <<'WARN'
[setup] ⚠️  poll-loop가 기동하지 않았습니다. 점검:
        launchctl print gui/$(id -u)/com.daniel.budget-sms
        tail "$HOME/Library/Application Support/budget-sms/stderr.log"
WARN
fi

cat <<DONE

=== 완료 ===
  - secret.env에 BUDGET_SMS_SECRET 값을 채우세요: $DIR/secret.env
  - 30초 후 자동 첫 폴링.
  - 수동 실행: bash "$DIR/poll.sh"
  - 로그 확인: log stream --predicate 'process == "poll.sh"' --info
DONE
