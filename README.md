# GATE

Servicio **aislado** que captura comprobantes en **cualquier formato** (imagen/PDF),
los **sanitiza**, **extrae sus datos** (OCR/IA), **detecta el banco/fintech de origen**
y devuelve un **link seguro** para ver cada operación. No decide dinero — eso queda en el PAM.

## Pipeline

```
Archivo crudo
  → E0  ClamAV (antivirus)
  → E1  Captura universal (MIME real: jpg/png/webp/heic/avif/gif/tiff/pdf)
  → E2  Sanitización (re-encode JPEG mozjpeg 85, strip metadata, ≤2000px)
  → E2b Dedup pHash (por subject) + SHA-256 (señal global cross-cuenta)
  → E3  Extracción IA (Claude → OpenAI → Gemini): monto, fecha, código, cuentas
  → E3b Detección de banco (catálogo AR → canonical + known/unknown)
  → E3c Validación + preview detection
  → { scan_id, phash, sha256, clean_base64, view_url, extraction, bank, validation }
```

## Quick start

```bash
npm install
npm run dev          # :4100
node scripts/smoke.mjs http://localhost:4100
```

## API

### `POST /scan` (Bearer)

**Request:**

```json
{
  "subject_id": "lead-123",
  "phone": "+5493510000000",
  "channel": "crm_livechat",
  "declared_mime": "image/jpeg",
  "data_base64": "<base64 crudo, sin data: prefix>"
}
```

`channel`: `crm_livechat` | `crm_whatsapp` | `pam_panel` | `pam_store` | `other`

**Response `accepted`:**

```json
{
  "status": "accepted",
  "scan_id": "uuid",
  "mime": "image/jpeg",
  "phash": "a1b2c3...",
  "sha256": "7689a1b9...",
  "clean_base64": "<jpeg base64 — para reenviar a register_deposit>",
  "view_url": "https://gate.example.com/receipts/{scan_id}?token=...",
  "view_token": "exp.sig",
  "extraction": {
    "monto": 50000, "fecha": "2026-06-29 14:30:00",
    "codigo_operacion": "...", "coelsa_id": "...",
    "cuenta_emisora": "...", "cuenta_receptora": "...",
    "entidad_emisora": "Mercado Pago", "confianza": 0.92,
    "signos_edicion": false, "estado_comprobante": "confirmado"
  },
  "bank": { "canonical": "Mercado Pago", "kind": "billetera", "known": true },
  "validation": { "is_valid": true, "alerts": [] },
  "duplicate_global": { "seen": false, "first_scan_id": null, "count": 0 },
  "forensic_status": "ok"
}
```

- `clean_base64`: JPEG re-encodeado. El CRM/PAM lo reenvían a `register_deposit`.
- `phash`: dHash 64-bit (dedup por subject). `sha256`: del JPEG limpio (dedup global).
- `bank`: entidad reconocida del catálogo AR (o `known:false` si desconocida).
- `duplicate_global`: si el mismo JPEG (sha256) ya se vio en otra operación.
- `forensic_status`: `ok` (extracción corrió) | `skipped` (sin API key o deshabilitado).

**Response `rejected`:** `{ status, reason, user_message }` — incluye `preview_receipt`, `not_a_receipt`, virus, duplicado, etc.  
**Response `failed`:** HTTP 502 `{ status: "failed", step, error }`

### `GET /scans/:scanId` (Bearer)

Metadata de una operación **sin** reenviar el archivo, con la **misma forma que `/scan`**:
`{ extraction, bank, validation, duplicate_global, forensic_status, view_url, ... }`.
Es la base del flujo `scan_id`-céntrico: el PAM lee de acá en vez de re-procesar el comprobante.

### `GET /receipts/:scanId`

- Query `?token=` — link firmado (operador / iframe en el panel del PAM)
- O `Authorization: Bearer` — server-to-server (CRM/PAM)

Devuelve `image/jpeg` (comprobante saneado).

### `GET /health` · `GET /stats` (stats con auth)

Ver `.env.example` y [docs/ESTADO.md](./docs/ESTADO.md).

## Documentación

**→ Estado: [docs/ESTADO.md](./docs/ESTADO.md)** · Índice: [docs/README.md](./docs/README.md) ·
Historia: [docs/historial/](./docs/historial/)

## Producción

```bash
RECEIPT_GATE_TOKENS=token-crm,token-pam \
RECEIPT_VIEW_SECRET=... \
RECEIPT_PUBLIC_URL=https://gate.example.com \
docker compose up --build
```
