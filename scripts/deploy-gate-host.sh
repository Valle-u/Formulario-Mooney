#!/usr/bin/env bash
# Deploy Receipt Gate en EC2 dedicado (Fase 0 del plan 09_MIGRACION_GATE_HOST.md).
# Correr EN el gate-host nuevo (Amazon Linux 2023, us-east-2 recomendado):
#   export ANTHROPIC_API_KEY='sk-ant-...'
#   export GATE_PUBLIC_URL='https://gate-test.megamooneymaker.com'
#   bash scripts/deploy-gate-host.sh
#
# Opcional:
#   RECEIPT_GATE_DIR=~/receipt-gate
#   SKIP_NGINX=1
#   ALLOW_CRM_IP=3.212.43.206
#   ALLOW_PAM_IP=3.15.65.122

set -euo pipefail

RECEIPT_GATE_DIR="${RECEIPT_GATE_DIR:-$HOME/receipt-gate}"
REPO_URL="${RECEIPT_GATE_REPO:-https://github.com/MartinLope369/Programa-Comprobantes.git}"
BRANCH="${RECEIPT_GATE_BRANCH:-main}"
GATE_PUBLIC_URL="${GATE_PUBLIC_URL:-https://gate-test.megamooneymaker.com}"
ALLOW_CRM_IP="${ALLOW_CRM_IP:-3.212.43.206}"
ALLOW_PAM_IP="${ALLOW_PAM_IP:-3.15.65.122}"
GATE_HOSTNAME="${GATE_HOSTNAME:-gate-test.megamooneymaker.com}"

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker no instalado"
docker compose version >/dev/null 2>&1 || die "docker compose plugin no disponible"
[[ -n "${ANTHROPIC_API_KEY:-}" ]] || die "exportá ANTHROPIC_API_KEY"

if [[ ! -d "$RECEIPT_GATE_DIR/.git" ]]; then
  log "Clonando repo en $RECEIPT_GATE_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$RECEIPT_GATE_DIR"
else
  log "Actualizando repo"
  git -C "$RECEIPT_GATE_DIR" fetch origin "$BRANCH"
  git -C "$RECEIPT_GATE_DIR" checkout "$BRANCH"
  git -C "$RECEIPT_GATE_DIR" pull --ff-only origin "$BRANCH"
fi

cd "$RECEIPT_GATE_DIR"

if [[ ! -f .env ]]; then
  TOKEN_CRM="$(openssl rand -hex 24)"
  TOKEN_PAM="$(openssl rand -hex 24)"
  VIEW_SECRET="$(openssl rand -hex 32)"
  cat > .env <<EOF
NODE_ENV=production
PORT=4100
DB_PATH=/data/receipt-gate.db
RECEIPT_STORAGE_PATH=/data/receipts
RECEIPT_PUBLIC_URL=${GATE_PUBLIC_URL}
RECEIPT_GATE_TOKENS=${TOKEN_CRM},${TOKEN_PAM}
RECEIPT_VIEW_SECRET=${VIEW_SECRET}
RECEIPT_FORENSIC_ENABLED=true
RECEIPT_FORENSIC_REQUIRED=auto
RECEIPT_CLAMAV_ENABLED=true
RECEIPT_CLAMAV_FAIL_CLOSED=true
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
ANTHROPIC_MODEL=claude-haiku-4-5
EOF
  chmod 600 .env
  log ".env creado con tokens nuevos"
else
  log "Usando .env existente; actualizando PUBLIC_URL y API key si hace falta"
  sed -i "s|^RECEIPT_PUBLIC_URL=.*|RECEIPT_PUBLIC_URL=${GATE_PUBLIC_URL}|" .env
  if grep -q '^ANTHROPIC_API_KEY=' .env; then
    sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}|" .env
  else
    echo "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}" >> .env
  fi
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

IFS=',' read -r TOKEN_CRM TOKEN_PAM <<< "${RECEIPT_GATE_TOKENS}"

log "Build + levantar gate + ClamAV..."
sudo docker compose --env-file .env up --build -d

deadline=$((SECONDS + 360))
while (( SECONDS < deadline )); do
  if curl -sf http://127.0.0.1:4100/health >/tmp/gate-health.json 2>/dev/null; then
    if python3 -c 'import json;d=json.load(open("/tmp/gate-health.json")); exit(0 if d.get("ok") and d.get("clamav",{}).get("ok") else 1)'; then
      break
    fi
  fi
  sleep 5
done
python3 -m json.tool /tmp/gate-health.json || die "Gate no pasó /health"

if [[ "${SKIP_NGINX:-}" != "1" ]]; then
  command -v nginx >/dev/null 2>&1 || { sudo dnf install -y nginx || sudo yum install -y nginx; }
  sudo tee /etc/nginx/conf.d/gate-test.conf >/dev/null <<NGINX
server {
    listen 80;
    server_name ${GATE_HOSTNAME};
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl http2;
    server_name ${GATE_HOSTNAME};
    client_max_body_size 12M;

    ssl_certificate     /etc/letsencrypt/live/${GATE_HOSTNAME}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${GATE_HOSTNAME}/privkey.pem;

    location / {
        allow ${ALLOW_CRM_IP};
        allow ${ALLOW_PAM_IP};
        deny all;
        proxy_pass http://127.0.0.1:4100;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
  log "Certbot (requiere DNS ${GATE_HOSTNAME} → esta IP):"
  log "  sudo certbot certonly --nginx -d ${GATE_HOSTNAME}"
  log "  sudo nginx -t && sudo systemctl enable --now nginx && sudo systemctl reload nginx"
fi

cat <<EOF

────────────────────────────────────────────────────────
Gate-host listo (loopback)
────────────────────────────────────────────────────────
Health:  curl -s http://127.0.0.1:4100/health
Smoke:   node scripts/smoke.mjs http://127.0.0.1:4100 ${TOKEN_CRM}

Tokens para migrate-cutover.sh:
  TOKEN_CRM=${TOKEN_CRM}
  TOKEN_PAM=${TOKEN_PAM}
  GATE_URL=${GATE_PUBLIC_URL}

Siguiente: DNS A ${GATE_HOSTNAME} → IP pública de este host, certbot, luego en casinodragon/SenderIO:
  bash scripts/migrate-cutover.sh
────────────────────────────────────────────────────────
EOF
