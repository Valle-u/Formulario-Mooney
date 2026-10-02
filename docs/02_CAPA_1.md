# Capa 1 — Portero de comprobantes (E0–E2)

> Implementada en `src/gate/`. Portada del CRM (`CRM/app/backend/src/receipt-gate/`).
> Diseño original: `CRM/docs/04_CAPA_SEGURIDAD_COMPROBANTES/README.md`

## Por qué existe

El comprobante es un archivo subido por terceros (WhatsApp, livechat, plataforma).
Sin filtro es vector de:

- **Malware** (polyglot, payloads embebidos)
- **Abuso** (no-comprobantes, spam, duplicados, DoS)
- **Exploits de parsers** (PDF/imagen maliciosos, image bombs)

La Capa 1 deja pasar **solo material limpio, normalizado y plausible**.

## Pipeline (6 capas internas)

| # | Capa | Qué hace | Falla → |
|---|------|----------|---------|
| — | **Anti-flood** (F3) | Contador de INTENTOS por `subject_id` al inicio | `rate_limited` |
| 0 | **ClamAV** | AV por firmas sobre buffer crudo | `infected` / `failed:clamav` |
| 1 | **Validación** | Tamaño, MIME real (magic bytes), dimensiones/MP | `too_small`, `too_large`, `bad_type`, `dimensions` |
| 2 | **Sanitización** | PDF→PNG 1ª pág (`pdftoppm`); re-encode JPEG sin metadata; downscale | `failed:sanitize` |
| 3 | **Semántica** | pHash dedup + clasificador stub (F7) | `duplicate`, `not_a_receipt` |
| 4 | **Rate-limit** | Máx aceptados por ventana | `rate_limited` |
| 5 | **Salida** | JPEG + phash | `accepted` |

### Nota F1 (MIME)

**No** se compara MIME declarado vs real. WhatsApp/Kommo declaran `application/octet-stream`
para imágenes legítimas. Se confía en magic bytes (`file-type`) + re-encode.

## Parámetros (`src/gate/config.ts`)

| Parámetro | Valor | Nota |
|-----------|-------|------|
| MIME entrada | jpeg, png, webp, heic, heif, pdf | Salida **siempre** jpeg |
| Tamaño | 3 KB – 10 MB | Paridad PAM |
| Megapíxeles máx | 50 | Anti image-bomb |
| Lado salida | 2000 px | downscale `fit:inside` |
| Calidad JPEG | 85 mozjpeg | |
| pHash threshold | Hamming ≤ 2 (+ sha256 exacto = dup siempre) | Por `subject_id`. Bajado de 5→2 (dep #179/#180) |
| Historial pHash | 200 / TTL 30 d | F14 |
| Rate-limit | 15 intentos + 5 aceptados / 10 min | F3 |

## pHash (spec)

dHash 64-bit sobre el **JPEG ya limpio**:

1. Greyscale → resize 9×8 (`fit:fill`)
2. Por fila: bit = `left < right ? 1 : 0` → 64 bits
3. Hex 16 caracteres
4. Duplicado si: **sha256 exacto** coincide con un envío previo del `subject_id` (mismos bytes,
   sin importar el pHash) **o** Hamming ≤ 2 (similitud visual "casi exacta", ej. recompresión del
   mismo archivo)

Código: `src/gate/helpers.ts` (`perceptualHash`, `hammingDistanceHex`, `isDuplicateForSubject`).

### Fix dep #179/#180 (falso duplicado DolarApp/ARQ, 2026-07-05)

Dos screenshots **distintos** de la misma operación (estado `PENDIENTE` → `COMPLETADA`, mismo
layout/fondo de la app, solo cambia el badge de estado) caían dentro del umbral viejo (Hamming
≤5) y el gate los marcaba `duplicate` sin serlo. Dos cambios:

1. **Umbral bajado 5→2**: solo bloquea por pHash cuando la similitud visual es "casi exacta"
   (recompresión del mismo archivo). El resend **exacto** (mismos bytes) sigue detectado siempre
   vía `sha256`, así que el caso principal de anti-duplicado no se debilita.
2. **`rememberPhash` se mueve a `pipeline/process-scan.ts`**, y se llama solo cuando el pipeline
   **completo** (gate E0–E2 + forense E3) acepta el comprobante. Antes se llamaba dentro de
   `runReceiptGate` (Capa 5), ANTES del forense — un comprobante que el forense rechazaba después
   (ej. `preview_receipt`) ya había "recordado" su pHash, y un reenvío legítimo y distinto (la
   versión `COMPLETADA`) podía chocar contra ese intento fallido.

## Clasificador "¿parece comprobante?" (F7)

**STUB:** `looksLikeReceipt()` → confianza `1` (no bloquea).

Decisión: mismo dueño paga CRM + PAM → no duplicar visión. El juez semántico es el PAM (Capa 2).
Umbral `0.6` cableado para integración futura.

## Mensajes al cliente (`user_message`)

| reason | Mensaje |
|--------|---------|
| too_small | El archivo está vacío o dañado. Reenviá la captura 🙏 |
| too_large | La imagen supera 10MB. Mandala más liviana 🙏 |
| bad_type | Formato no válido. Mandame una foto (JPG/PNG) o PDF del comprobante 🙏 |
| duplicate | Ese comprobante ya me lo enviaste 🙂 Si hiciste otra carga, mandame el nuevo. |
| not_a_receipt | Eso no parece un comprobante 🙈. Mandame la captura de la transferencia 🙏 |
| rate_limited | Recibí varios comprobantes seguidos ⏳. Esperá un momentito y reintentá 🙏 |
| infected | No pude procesar el archivo 🙏. Mandame de nuevo la captura. (sin revelar AV) |

## ClamAV

- Prod: `RECEIPT_CLAMAV_ENABLED=true`, sidecar en `docker-compose.yml`
- Dev/Windows: OFF
- `failClosed=true`: clamd caído → rechazo (F5)
- Health: `GET /health` + cache en `src/gate/clamav.ts`

## Capacidades del host (F8)

Al arranque: log `heif` / `poppler` / `clamavEnabled`. Advierte si `allowedMime` acepta
formato que el host no procesa. Ver `src/gate/capabilities.ts`.

## Archivos del gate

| Archivo | Rol |
|---------|-----|
| `config.ts` | Umbrales centralizados |
| `clamav.ts` | Wrapper AV + healthcheck |
| `helpers.ts` | PDF, pHash, dedup, rate-limit |
| `receipt-gate.ts` | Orquestador `runReceiptGate` |
| `capabilities.ts` | Check host al boot |
| `../db/phash.ts` | Store dedup (SQLite) |
| `../http/server.ts` | POST /scan, /health, /stats |

## Tests

```bash
npm run dev          # levantar en :4100
node scripts/smoke.mjs http://localhost:4100
```

Casos: accepted, duplicate, too_small, bad_type.
