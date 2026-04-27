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

# 2) poll.sh 복사 (있으면 갱신)
cp "$(dirname "$0")/poll.sh" "$DIR/poll.sh"
chmod 700 "$DIR/poll.sh"

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

# 6) plist 설치
mkdir -p "$HOME/Library/LaunchAgents"
sed "s|__HOME__|$HOME|g" "$PLIST_SRC" > "$PLIST_DST"
launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load "$PLIST_DST"
echo "[setup] launchd agent 등록 완료: $PLIST_DST"

cat <<DONE

=== 완료 ===
  - secret.env에 BUDGET_SMS_SECRET 값을 채우세요: $DIR/secret.env
  - 30초 후 자동 첫 폴링.
  - 수동 실행: bash "$DIR/poll.sh"
  - 로그 확인: log stream --predicate 'process == "poll.sh"' --info
DONE
