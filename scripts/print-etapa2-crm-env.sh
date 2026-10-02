#!/usr/bin/env bash
# Imprime las variables del CRM para Etapa 2 (correr en el EC2 del gate).
set -euo pipefail
ENV=~/receipt-gate/.env
TOKEN_CRM=$(grep '^RECEIPT_GATE_TOKENS=' "$ENV" | cut -d= -f2- | cut -d, -f1)
cat <<EOF
# Pegar en SenderIO → CRM/app/backend/.env
RECEIPT_GATE_CLIENT=http
RECEIPT_GATE_URL=https://test.megamooneymaker.com/receipt-gate
RECEIPT_GATE_TOKEN=${TOKEN_CRM}
RECEIPT_GATE_TIMEOUT_MS=30000
EOF
