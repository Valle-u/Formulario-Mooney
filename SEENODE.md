# Deploy en Seenode (Formulario-Mooney)

Flujo: **staging primero** → luego promover a `main` / servicio prod.

## Servicio staging

| Campo | Valor |
|-------|--------|
| Repo | `matatan-akatsuki/Programa-Comprobantes` (privado) |
| Branch | `staging` |
| Runtime | Node 24 |
| Build | `npm install && npm run build` |
| Start | `npm start` |
| Port | `4100` |

## Variables (staging)

```bash
NODE_ENV=production
PORT=4100
DB_PATH=/tmp/receipt-gate.db
RECEIPT_STORAGE_PATH=/tmp/receipts
RECEIPT_PUBLIC_URL=https://<url-seenode-del-servicio>
RECEIPT_GATE_TOKENS=<token-mooney>
RECEIPT_VIEW_SECRET=<secret-hmac>
RECEIPT_CLAMAV_ENABLED=false
RECEIPT_CLAMAV_FAIL_CLOSED=false
RECEIPT_FORENSIC_ENABLED=true
RECEIPT_FORENSIC_REQUIRED=false
# Cargar aparte (otro usuario / vault):
# ANTHROPIC_API_KEY=
# OPENAI_API_KEY=
# GEMINI_API_KEY=
```

Notas:
- Sin volumen persistente, `/tmp` se pierde en redeploy (OK para staging).
- ClamAV off en Seenode (no hay sidecar).
- Con `RECEIPT_FORENSIC_REQUIRED=false` el servicio arranca sin key de IA.

## Seenode + env

Seenode monta env vars en el **build** y eso puede romper la imagen. Para staging usamos
`seenode.staging.env` (cargado por `src/config/load-env.ts`) en la rama de deploy.
No subir secretos al repo canónico; el mirror de deploy puede llevar el archivo de staging.
