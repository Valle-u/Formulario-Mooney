#!/usr/bin/env bash
# Fase 2 — Corte de migración gate (plan docs/09_MIGRACION_GATE_HOST.md).
# Correr desde casinodragon con acceso SSH a SenderIO (jump.pem):
#   export TOKEN_CRM='...' TOKEN_PAM='...'
#   export GATE_URL='https://gate-test.megamooneymaker.com'
#   bash scripts/migrate-cutover.sh
#
# Si el gate sigue en casinodragon (interim):
#   GATE_URL=https://test.megamooneymaker.com/receipt-gate
#
# Opcional:
#   SKIP_PAM=1  SKIP_CRM=1  SKIP_NGINX_OLD=1  SKIP_GATE_ENV=1

set -euo pipefail

GATE_URL="${GATE_URL:-https://test.megamooneymaker.com/receipt-gate}"
RECEIPT_GATE_DIR="${RECEIPT_GATE_DIR:-$HOME/receipt-gate}"
PAM_ENV="${PAM_ENV:-$HOME/casinodragon-test/.env}"
CRM_SSH="${CRM_SSH:-ec2-user@3.212.43.206}"
JUMP_KEY="${JUMP_KEY:-$HOME/.ssh/jump.pem}"
CRM_ENV="${CRM_ENV:-/home/ec2-user/CRM/app/backend/.env}"

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ -n "${TOKEN_CRM:-}" ]] || die "exportá TOKEN_CRM (1er token de RECEIPT_GATE_TOKENS)"
[[ -n "${TOKEN_PAM:-}" ]] || die "exportá TOKEN_PAM (2º token)"

set_kv() {
  local file="$1" key="$2" val="$3"
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    echo "${key}=${val}" >> "$file"
  fi
}

if [[ "${SKIP_GATE_ENV:-}" != "1" && -f "$RECEIPT_GATE_DIR/.env" ]]; then
  log "Actualizando RECEIPT_PUBLIC_URL en gate ($RECEIPT_GATE_DIR/.env)"
  cp "$RECEIPT_GATE_DIR/.env" "${RECEIPT_GATE_DIR}/.env.bak.$(date +%Y%m%d-%H%M%S)"
  set_kv "$RECEIPT_GATE_DIR/.env" RECEIPT_PUBLIC_URL "$GATE_URL"
  if [[ -n "${RECEIPT_GATE_TOKENS:-}" ]]; then
    set_kv "$RECEIPT_GATE_DIR/.env" RECEIPT_GATE_TOKENS "$RECEIPT_GATE_TOKENS"
  fi
  log "Reiniciando gate docker..."
  (cd "$RECEIPT_GATE_DIR" && sudo docker compose --env-file .env up -d)
  sleep 3
  if curl -sf http://127.0.0.1:4100/health >/tmp/gate-cutover-health.json 2>/dev/null; then
    log "Health OK (loopback)"
  elif curl -sfk "${GATE_URL%/}/health" >/tmp/gate-cutover-health.json 2>/dev/null; then
    log "Health OK ($GATE_URL)"
  else
    die "Health falló (loopback y $GATE_URL)"
  fi
  python3 -m json.tool /tmp/gate-cutover-health.json
fi

if [[ "${SKIP_PAM:-}" != "1" && -f "$PAM_ENV" ]]; then
  log "Actualizando PAM ($PAM_ENV) → HTTPS externo"
  cp "$PAM_ENV" "${PAM_ENV}.bak.$(date +%Y%m%d-%H%M%S)"
  set_kv "$PAM_ENV" RECEIPT_GATE_URL "$GATE_URL"
  set_kv "$PAM_ENV" RECEIPT_GATE_TOKEN "$TOKEN_PAM"
  if [[ -x "$HOME/deploy-test.sh" ]]; then
    log "Redeploy PAM..."
    bash "$HOME/deploy-test.sh" || log "AVISO: redeploy manual si falló"
  else
    log "Redeploy manual: bash ~/deploy-test.sh <rama>"
  fi
fi

if [[ "${SKIP_CRM:-}" != "1" ]]; then
  log "Actualizando CRM en SenderIO..."
  [[ -f "$JUMP_KEY" ]] || die "No encontré jump.pem en $JUMP_KEY"
  ssh -i "$JUMP_KEY" -o StrictHostKeyChecking=no "$CRM_SSH" bash -s <<REMOTE
set -euo pipefail
ENV_FILE="$CRM_ENV"
cp "\$ENV_FILE" "\${ENV_FILE}.bak.\$(date +%Y%m%d-%H%M%S)"
for kv in "RECEIPT_GATE_CLIENT=http" "RECEIPT_GATE_URL=${GATE_URL}" "RECEIPT_GATE_TOKEN=${TOKEN_CRM}" "RECEIPT_GATE_TIMEOUT_MS=30000"; do
  key="\${kv%%=*}"; val="\${kv#*=}"
  if grep -q "^\${key}=" "\$ENV_FILE"; then sed -i "s|^\${key}=.*|\${key}=\${val}|" "\$ENV_FILE"; else echo "\${key}=\${val}" >> "\$ENV_FILE"; fi
done
curl -sk -o /tmp/gate-h.json -w '%{http_code}' "${GATE_URL%/}/health" | grep -q 200
pm2 restart crm-backend --update-env
REMOTE
fi

if [[ "${SKIP_NGINX_OLD:-}" != "1" ]]; then
  NGINX_CONF="/etc/nginx/conf.d/casinodragon-test.conf"
  if [[ -f "$NGINX_CONF" ]] && grep -q 'location /receipt-gate/' "$NGINX_CONF"; then
    log "Comentando location /receipt-gate/ en nginx (rollback: restaurar backup)"
    sudo cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%Y%m%d-%H%M%S)"
    sudo sed -i '/location \/receipt-gate\//,/^[[:space:]]*}/ s/^/# MIGRATED /' "$NGINX_CONF"
    sudo nginx -t && sudo systemctl reload nginx
    log "Proxy viejo deshabilitado"
  fi
fi

cat <<EOF

────────────────────────────────────────────────────────
Corte completado
────────────────────────────────────────────────────────
GATE_URL=${GATE_URL}
TOKEN_CRM (CRM): ${TOKEN_CRM:0:8}...
TOKEN_PAM (PAM): ${TOKEN_PAM:0:8}...

Validar:
  node scripts/smoke.mjs ${GATE_URL%/} ${TOKEN_CRM}
  Livechat → comprobante → scan crm_livechat
  Panel PAM → comprobante → scan pam_panel
────────────────────────────────────────────────────────
EOF
