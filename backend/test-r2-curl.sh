#!/bin/bash

# Script para probar R2 con curl (evita problemas de Node.js/OpenSSL)

ACCOUNT_ID="5627e3f2c291921ace435f3cca4643c5"
ACCESS_KEY="a32d1fecbbecc24abb317b0931828b17"
SECRET_KEY="c0c4f87cd04cc3cc5e2840281bd31d2e9a1be3ee77459a833643a9bbd44a6ec3d"
BUCKET="mooneymaker-formulario-premios-comprobantes"
FILENAME="test-curl-$(date +%s).txt"

echo "🧪 Probando Cloudflare R2 con curl"
echo ""
echo "📝 Archivo: $FILENAME"
echo "🪣 Bucket: $BUCKET"
echo ""

# Crear archivo de prueba
echo "Este es un archivo de prueba desde curl" > /tmp/$FILENAME

# Endpoint de R2
ENDPOINT="https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${FILENAME}"

echo "📤 Subiendo a: $ENDPOINT"
echo ""

# Intentar subir con curl
curl -X PUT \
  -H "Content-Type: text/plain" \
  --aws-sigv4 "aws:amz:auto:s3" \
  --user "${ACCESS_KEY}:${SECRET_KEY}" \
  --data-binary "@/tmp/${FILENAME}" \
  "$ENDPOINT" \
  -v 2>&1 | head -50

echo ""
echo "✅ Prueba completada"
