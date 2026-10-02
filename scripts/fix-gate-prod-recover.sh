#!/usr/bin/env bash
# Recuperación gate prod: ClamAV sidecar + gate + nginx + verificación HTTPS local.
# Ejecutar EN el EC2 gate prod (3.12.87.253):
#   cd ~/gate && bash scripts/fix-gate-prod-recover.sh

set -euo pipefail

DIR="${1:-}"
if [[ -z "$DIR" ]]; then
  for d in ~/gate ~/receipt-gate; do
    [[ -f "$d/docker-compose.yml" ]] && DIR="$d" && break
  done
fi
[[ -n "$DIR" && -f "$DIR/docker-compose.yml" ]] || { echo "No docker-compose.yml en ~/gate ni ~/receipt-gate"; exit 1; }

cd "$DIR"
echo "==> $PWD"

echo "==> nginx"
sudo systemctl is-active nginx || sudo systemctl start nginx
sudo nginx -t && sudo systemctl reload nginx

echo "==> docker antes"
docker compose ps

echo "==> restart clamav"
docker compose restart clamav

echo "==> esperando healthy (hasta 3 min)..."
deadline=$((SECONDS + 180))
while (( SECONDS < deadline )); do
  if docker compose ps clamav 2>/dev/null | grep -q healthy; then
    echo "clamav: healthy"
    break
  fi
  sleep 5
done

if ! docker compose ps clamav 2>/dev/null | grep -q healthy; then
  echo "WARN: clamav sigue unhealthy — logs:"
  docker compose logs clamav --tail 40
  exit 1
fi

echo "==> restart gate"
docker compose restart gate
sleep 8

echo "==> health local"
curl -sf http://127.0.0.1:4100/health | python3 -m json.tool 2>/dev/null || curl -sf http://127.0.0.1:4100/health
sleep 3
curl -sf http://127.0.0.1:4100/health | python3 -m json.tool 2>/dev/null || curl -sf http://127.0.0.1:4100/health

echo "==> health HTTPS local"
curl -skf https://127.0.0.1/health | python3 -m json.tool 2>/dev/null || curl -skf https://127.0.0.1/health

echo "==> OK — avisar CRM para reverificar /health"
