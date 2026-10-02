#!/usr/bin/env bash
# Deploy Etapa 1 — gate interno en el mismo EC2 que casinodragon (PAM test).
# Uso en el EC2 (us-east-2):
#   export ANTHROPIC_API_KEY='sk-ant-...'
#   bash scripts/deploy-etapa1.sh
#
# Opcional:
#   RECEIPT_GATE_DIR=~/receipt-gate
#   PAM_CONTAINER=casinodragon-test
#   SKIP_PAM_CONNECT=1          # solo levanta el gate
#   SKIP_DOCKER_BUILD=1         # no rebuild (solo up -d)

set -euo pipefail

RECEIPT_GATE_DIR="${RECEIPT_GATE_DIR:-$HOME/receipt-gate}"
REPO_URL="${RECEIPT_GATE_REPO:-https://github.com/MartinLope369/Programa-Comprobantes.git}"
PAM_CONTAINER="${PAM_CONTAINER:-casinodragon-test}"
BRANCH="${RECEIPT_GATE_BRANCH:-main}"

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker no instalado"
docker compose version >/dev/null 2>&1 || die "docker compose plugin no disponible"

if [[ ! -d "$RECEIPT_GATE_DIR/.git" ]]; then
  log "Clonando repo en $RECEIPT_GATE_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$RECEIPT_GATE_DIR"
else
  log "Actualizando repo en $RECEIPT_GATE_DIR"
  git -C "$RECEIPT_GATE_DIR" fetch origin "$BRANCH"
  git -C "$RECEIPT_GATE_DIR" checkout "$BRANCH"
  git -C "$RECEIPT_GATE_DIR" pull --ff-only origin "$BRANCH"
fi

cd "$RECEIPT_GATE_DIR"

if [[ ! -f .env ]]; then
  log "Creando .env de test (secretos nuevos). Completá ANTHROPIC_API_KEY si falta."
  TOKEN_CRM="$(openssl rand -hex 24)"
  TOKEN_PAM="$(openssl rand -hex 24)"
  VIEW_SECRET="$(openssl rand -hex 32)"
  cat > .env <<EOF
NODE_ENV=production
PORT=4100
DB_PATH=/data/receipt-gate.db
RECEIPT_STORAGE_PATH=/data/receipts
RECEIPT_PUBLIC_URL=http://receipt-gate:4100
RECEIPT_GATE_TOKENS=${TOKEN_CRM},${TOKEN_PAM}
RECEIPT_VIEW_SECRET=${VIEW_SECRET}
RECEIPT_FORENSIC_ENABLED=true
RECEIPT_FORENSIC_REQUIRED=auto
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
ANTHROPIC_MODEL=claude-haiku-4-5
EOF
  chmod 600 .env
  log ".env creado en $RECEIPT_GATE_DIR/.env"
else
  log "Usando .env existente ($RECEIPT_GATE_DIR/.env)"
  if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    if grep -q '^ANTHROPIC_API_KEY=' .env; then
      sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}|" .env
    else
      echo "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}" >> .env
    fi
  fi
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

[[ -n "${RECEIPT_GATE_TOKENS:-}" ]] || die "RECEIPT_GATE_TOKENS vacío en .env"
[[ -n "${RECEIPT_VIEW_SECRET:-}" ]] || die "RECEIPT_VIEW_SECRET vacío en .env"
[[ -n "${ANTHROPIC_API_KEY:-}" ]] || die "ANTHROPIC_API_KEY vacío — exportá la variable antes de correr el script"

IFS=',' read -r TOKEN_CRM TOKEN_PAM <<< "${RECEIPT_GATE_TOKENS}"

COMPOSE=(sudo docker compose --env-file .env)
if [[ "${SKIP_DOCKER_BUILD:-}" == "1" ]]; then
  log "Levantando contenedores (sin rebuild)..."
  "${COMPOSE[@]}" up -d
else
  log "Build + levantar gate + ClamAV (1ª vez ClamAV tarda ~2 min en firmas)..."
  "${COMPOSE[@]}" up --build -d
fi

log "Esperando health en loopback..."
deadline=$((SECONDS + 300))
health_ok=0
while (( SECONDS < deadline )); do
  if curl -sf http://127.0.0.1:4100/health >/tmp/receipt-gate-health.json 2>/dev/null; then
    if python3 <<'PY'
import json
d = json.load(open("/tmp/receipt-gate-health.json"))
raise SystemExit(0 if d.get("ok") and d.get("clamav", {}).get("ok") else 1)
PY
    then
      health_ok=1
      break
    fi
  fi
  sleep 5
done

if [[ "$health_ok" != "1" ]]; then
  log "Health no OK aún. Logs recientes del gate:"
  sudo docker logs receipt-gate --tail 80 || true
  die "Gate no pasó /health (revisá logs arriba)"
fi

log "Health OK:"
python3 -m json.tool /tmp/receipt-gate-health.json

if [[ "${SKIP_PAM_CONNECT:-}" != "1" ]]; then
  if sudo docker ps --format '{{.Names}}' | grep -qx "$PAM_CONTAINER"; then
    if sudo docker network inspect receipt-net --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | grep -q "$PAM_CONTAINER"; then
      log "Contenedor $PAM_CONTAINER ya está en receipt-net"
    else
      log "Conectando $PAM_CONTAINER a receipt-net..."
      sudo docker network connect receipt-net "$PAM_CONTAINER"
    fi
  else
    log "AVISO: contenedor $PAM_CONTAINER no está corriendo — conectalo después:"
    printf '  sudo docker network connect receipt-net %s\n' "$PAM_CONTAINER"
  fi
fi

cat <<EOF

────────────────────────────────────────────────────────
Etapa 1 — gate arriba en este EC2
────────────────────────────────────────────────────────
Health:  curl -s http://127.0.0.1:4100/health
Stats:   curl -s http://127.0.0.1:4100/stats -H "Authorization: Bearer ${TOKEN_PAM}"

Agregar en ~/casinodragon-test/.env (PAM):
  RECEIPT_GATE_URL=http://receipt-gate:4100
  RECEIPT_GATE_TOKEN=${TOKEN_PAM}

Redeploy PAM (rama feat/payments/receipt-gate-integracion):
  bash ~/deploy-test.sh feat/payments/receipt-gate-integracion

Si deploy-test.sh recrea el contenedor:
  sudo docker network connect receipt-net ${PAM_CONTAINER}

Token CRM (Etapa 2 / SenderIO — guardalo, no se usa aún en Etapa 1):
  ${TOKEN_CRM}

Smoke desde la box (opcional):
  node scripts/smoke.mjs http://127.0.0.1:4100 ${TOKEN_PAM}
────────────────────────────────────────────────────────
EOF
