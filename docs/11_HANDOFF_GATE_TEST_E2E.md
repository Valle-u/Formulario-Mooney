# Handoff gate-test — E2E scan_id (CRM → GATE → PAM)

> **Estado 2026-07-01:** el bloqueante de **token** quedó **resuelto** — el PAM aportó un token
> de gate-test LIVE que da `/stats` 200 (`63d651d6…`). El gate valida `RECEIPT_GATE_TOKENS` como
> **lista plana** (`src/http/server.ts::tokenValido`) → el CRM reusa ese token; no hace falta rotar
> ni esperar al dev. Ver `10_DEPLOY_Y_CUTOVER.md` §4 y §6.
>
> Este doc queda como **referencia histórica** del handoff y como plantilla si hace falta escalar
> al dev de gate-test (ej. créditos Anthropic/OCR forense caído en gate-test LIVE).

## Resolución (2026-07-01)

| Item | Resultado |
|------|-----------|
| Token gate-test | ✅ `63d651d6…` (del PAM test, `/stats` 200) — CRM lo reusa |
| PAM test URL | ✅ `https://test.megamooneymaker.com` |
| Mismo gate CRM+PAM | ✅ `gate-test.megamooneymaker.com` |
| Portal test | `store_slug=adminmegamooney-mqs5sgx7` |
| Pendiente CRM | `.env` (token + PAM_URL) + smoke E2E — **bloqueado por ClamAV** |
| Bloqueante actual | ClamAV caído en gate-test → `POST /scan` 502 `failed:clamav` |
| Riesgo posterior | Créditos Anthropic en gate-test LIVE |

---

## Problema original (histórico)

| Endpoint | Resultado desde CRM prod (`3.212.43.206`) |
|----------|-------------------------------------------|
| `GET /health` | **200** ✅ (firewall OK) |
| `GET /stats` con Bearer | **401** ❌ |
| `POST /scan` con Bearer | **401** ❌ (mismo comportamiento) |

Probamos todos los tokens del vault y el de prod — **todos 401**. Eso indica que
gate-test **LIVE** tiene su propia lista `RECEIPT_GATE_TOKENS`, distinta a la documentada
en el vault local.

Tokens probados (prefijo):
- `ba0c3a6a…` (crm-test vault)
- `be3bedae…` (pam-test vault)
- `f48GbBF2…` (token prod gate)

## Lo que necesitamos del dev

### 1. Token(s) válidos de `RECEIPT_GATE_TOKENS` en gate-test LIVE
Con uno que esté hoy en esa lista alcanza para autenticar `/scan` y `/stats`. Idealmente indicar:
- cuál asignamos al **CRM** (`RECEIPT_GATE_TOKEN`)
- cuál al **PAM test** (`RECEIPT_GATE_TOKEN` en `casinodragon-test`)
- (o confirmar si comparten el mismo token).

### 2. Confirmar alineación PAM test ↔ mismo gate
El PAM test debe apuntar al **mismo gate**:
```
RECEIPT_GATE_URL=https://gate-test.megamooneymaker.com
RECEIPT_GATE_TOKEN=<token válido de la misma lista>
```
> ⚠️ **Clave:** CRM y PAM tienen que usar el **mismo gate**, porque el `scan_id` es
> específico del gate que lo emitió. Si el CRM escanea en gate-test y el PAM lee de otro
> gate, el E2E falla.

### 3. Confirmar build scan_id en gate-test (contrato v2)

| Endpoint | Esperado |
|----------|----------|
| `POST /scan` | `{ status: "accepted", scan_id, phash, clean_base64, extraction?, bank?, validation?, … }` o `{ status: "rejected" \| "failed", … }` |
| `GET /scans/:scan_id` | Metadata/extracción (monto, fecha, banco) — **sin re-OCR** |
| `GET /receipts/:scan_id` | Proxy imagen con Bearer |

Auth: `Authorization: Bearer <token>` en `/scan`, `/stats`, `/scans/:id`, `/receipts/:id`.

**Payload que manda el CRM a `POST /scan`:**
```json
{
  "subject_id": "<lead_id>",
  "phone": "+549…",
  "channel": "crm_livechat",
  "declared_mime": "image/jpeg",
  "filename": "…",
  "data_base64": "…"
}
```

**Respuesta mínima que consume el CRM (`client.ts`):**
```json
{
  "status": "accepted",
  "scan_id": "<uuid>",
  "mime": "image/jpeg",
  "phash": "…",
  "clean_base64": "…",
  "extraction": { "monto": "…" }
}
```

**Luego el CRM llama al PAM con solo `scan_id` + identidad (sin base64):**
```json
{
  "action": "register_deposit",
  "scan_id": "<del gate>",
  "client_op_id": "<operacion CRM>",
  "telefono": "…",
  "username": "…",
  "bonus_type": "…",
  "store_slug": "…",
  "receipt_channel": "crm_livechat"
}
```
El PAM relee imagen y extracción del gate por `scan_id` (`GET /receipts/:id` + `GET /scans/:id`).

## Nuestro lado (listo)

| Item | Estado |
|------|--------|
| CRM prod | `crm.blackkdragon.work` · commit `6c348ad` (scan_id activo) |
| IP CRM | `3.212.43.206` — ya pasa firewall (`/health` 200) |
| `.env` CRM | `RECEIPT_GATE_URL=https://gate-test.megamooneymaker.com` ✅ |
| `PAM_RECEIPT_TRANSITION_BASE64` | `false` (solo scan_id, sin fallback base64) |
| PAM | Conectado (`PAM_CLIENT=http`); no tocamos `PAYBOT_SECRET` |

**En cuanto nos pasen el token CRM válido:**
```bash
# en EC2 prod
RECEIPT_GATE_TOKEN=<token>   # en ~/CRM/app/backend/.env
pm2 restart crm-backend --update-env
# verificación rápida:
curl -H "Authorization: Bearer $TOKEN" https://gate-test.megamooneymaker.com/stats  # → 200
curl http://127.0.0.1:3001/api/stats  # gateRemoto.ok:true
# smoke: comprobante real por livechat → scan_id → register_deposit → evento PAM
```

## Checklist de cierre E2E

- [ ] Token CRM gate-test entregado y probado (`/stats` → 200)
- [ ] PAM test apunta a `gate-test.megamooneymaker.com` con token de la misma lista
- [ ] `POST /scan` devuelve `scan_id` en `accepted`
- [ ] PAM lee `GET /scans/:scan_id` y `GET /receipts/:scan_id` con su token
- [ ] Smoke CRM: comprobante → scan → `register_deposit` → `deposit.accepted` en `/pam/events`

## Docs de referencia
- Gate: [`05_INTEGRACION_CRM_PAM.md`](./05_INTEGRACION_CRM_PAM.md) · [`10_DEPLOY_Y_CUTOVER.md`](./10_DEPLOY_Y_CUTOVER.md)
- CRM: `docs/27_PROGRAMA_COMPROBANTES.md`
