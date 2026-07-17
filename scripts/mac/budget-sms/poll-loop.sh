#!/usr/bin/env bash
# budget-sms poll loop: 30초마다 poll.sh, 6시간마다 watchdog.sh 실행.
#
# 왜 StartInterval이 아니라 장수 프로세스인가 (2026-07-17 장애):
# macOS가 소프트웨어 업데이트 재시동을 기다리는 동안 launchd는 신규 잡 스폰을
# 전부 보류한다(pended nondemand spawn). StartInterval 잡은 매 주기가 새 스폰이라
# 그대로 멈추지만, 이미 떠 있는 프로세스는 영향이 없다. KeepAlive 루프로 돌리면
# 이 상태를 그대로 통과한다.
#
# 매 사이클 heartbeat.txt에 타임스탬프를 남기고, cron의 check-heartbeat.sh가
# 이 파일이 오래되면(=루프 사망) 알림을 띄운다. cron은 chat.db를 읽을 수 없어
# (Full Disk Access 없음) 수집 자체는 못 하지만 생존 감시는 가능하다.
set -u

DIR="$HOME/Library/Application Support/budget-sms"
HEARTBEAT="$DIR/heartbeat.txt"
POLL_INTERVAL=30
WATCHDOG_EVERY=$((6 * 60 * 60 / POLL_INTERVAL))  # 720 사이클 = 6시간

i=0
while true; do
  /bin/bash "$DIR/poll.sh" || true
  date +%s > "$HEARTBEAT"
  if [ $((i % WATCHDOG_EVERY)) -eq 0 ]; then
    /bin/bash "$DIR/watchdog.sh" || true
  fi
  i=$((i + 1))
  sleep "$POLL_INTERVAL"
done
