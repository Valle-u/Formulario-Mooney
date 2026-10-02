#!/usr/bin/env bash
# Levantar ClamAV sidecar en gate-test (o cualquier host con docker compose gate+clamav).
# Uso EN el EC2 gate-test:
#   cd ~/receipt-gate || cd ~/gate
#   bash scripts/fix-gate-test-clamav.sh

set -euo pipefail

DIR="${1:-}"
if [[ -z "$DIR" ]]; then
  for d in ~/receipt-gate ~/gate; do
    [[ -f "$d/docker-compose.yml" ]] && DIR="$d" && break
  done
fi
[[ -n "$DIR" && -f "$DIR/docker-compose.yml" ]] || { echo "No docker-compose.yml en ~/receipt-gate ni ~/gate"; exit 1; }

cd "$DIR"
echo "==> $PWD"
docker compose ps
echo "==> Levantar clamav..."
docker compose up -d clamav
echo "==> Esperando healthy (hasta ~3 min)..."
deadline=$((SECONDS + 180))
while (( SECONDS < deadline )); do
  if docker compose ps clamav 2>/dev/null | grep -q healthy; then
    echo "clamav: healthy"
    break
  fi
  sleep 5
done
docker compose ps
docker compose restart gate
sleep 2
curl -sf http://127.0.0.1:4100/health | python3 -m json.tool 2>/dev/null || curl -sf http://127.0.0.1:4100/health
echo "==> Si clamav.ok=true, reintentar POST /scan desde CRM."
