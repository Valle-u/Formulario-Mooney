#!/usr/bin/env bash
# Watchdog: reinicia clamav+gate si el sidecar deja de estar healthy.
# Instalar en gate prod (cron cada 5 min):
#   */5 * * * * /home/ec2-user/gate/scripts/watch-clamav.sh >> /home/ec2-user/gate/clamav-watch.log 2>&1

set -euo pipefail

DIR="${GATE_DIR:-$HOME/gate}"
[[ -f "$DIR/docker-compose.yml" ]] || DIR="$HOME/receipt-gate"
[[ -f "$DIR/docker-compose.yml" ]] || exit 0

cd "$DIR"

status="$(docker compose ps clamav --format '{{.Status}}' 2>/dev/null || true)"
if echo "$status" | grep -q healthy; then
  exit 0
fi

echo "$(date -Is) clamav unhealthy ($status) — restart clamav+gate"
docker compose restart clamav
deadline=$((SECONDS + 180))
while (( SECONDS < deadline )); do
  if docker compose ps clamav 2>/dev/null | grep -q healthy; then
    break
  fi
  sleep 5
done
docker compose restart gate
