#!/usr/bin/env bash
# Configura el CRM en SenderIO para Etapa 2 (HTTP al gate por HTTPS).
# Correr EN SenderIO (ec2-user@3.212.43.206):
#   export RECEIPT_GATE_TOKEN='<1er token del gate>'
#   bash configure-senderio-etapa2.sh
#
# Opcional:
#   CRM_ENV=/ruta/al/CRM/app/backend/.env
#   RECEIPT_GATE_URL=https://test.megamooneymaker.com/receipt-gate

set -euo pipefail

RECEIPT_GATE_URL="${RECEIPT_GATE_URL:-https://test.megamooneymaker.com/receipt-gate}"
RECEIPT_GATE_TIMEOUT_MS="${RECEIPT_GATE_TIMEOUT_MS:-30000}"

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ -n "${RECEIPT_GATE_TOKEN:-}" ]] || die "exportá RECEIPT_GATE_TOKEN (1er token de RECEIPT_GATE_TOKENS del gate)"

if [[ -n "${CRM_ENV:-}" ]]; then
  ENV_FILE="$CRM_ENV"
else
  for candidate in \
    "$HOME/CRM/app/backend/.env" \
    "$HOME/crm/app/backend/.env" \
    "$HOME/senderio/CRM/app/backend/.env" \
    "$HOME/SenderIO/CRM/app/backend/.env"; do
    if [[ -f "$candidate" ]]; then
      ENV_FILE="$candidate"
      break
    fi
  done
fi

[[ -n "${ENV_FILE:-}" && -f "$ENV_FILE" ]] || die "No encontré .env del CRM. Pasá CRM_ENV=/ruta/al/.env"

log "Usando $ENV_FILE"

set_kv() {
  local key="$1" val="$2" file="$3"
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    echo "${key}=${val}" >> "$file"
  fi
}

cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d-%H%M%S)"
set_kv RECEIPT_GATE_CLIENT http "$ENV_FILE"
set_kv RECEIPT_GATE_URL "$RECEIPT_GATE_URL" "$ENV_FILE"
set_kv RECEIPT_GATE_TOKEN "$RECEIPT_GATE_TOKEN" "$ENV_FILE"
set_kv RECEIPT_GATE_TIMEOUT_MS "$RECEIPT_GATE_TIMEOUT_MS" "$ENV_FILE"

log "Variables actualizadas:"
grep -E '^RECEIPT_GATE_' "$ENV_FILE" | sed 's/TOKEN=.*/TOKEN=***/'

log "Probando conectividad al gate..."
code=$(curl -sk -o /tmp/gate-health.json -w '%{http_code}' "${RECEIPT_GATE_URL}/health" || true)
if [[ "$code" == "200" ]] && python3 -c 'import json; json.load(open("/tmp/gate-health.json"))' 2>/dev/null; then
  log "Health OK (${code})"
else
  die "No pude llegar a ${RECEIPT_GATE_URL}/health (HTTP ${code}). Revisá security group / nginx allow 3.212.43.206"
fi

log "Reiniciá el backend del CRM (pm2/systemd/docker según tu deploy)."
log "Ejemplo pm2: pm2 restart crm-backend  |  docker compose restart backend"
