# Capa 2 — Extracción forense (E3) + detección de banco (E3b)

> **Estado: IMPLEMENTADA y testeada con comprobantes reales** (`src/forensic/`). Portada del PAM
> (`receipt-reader.ts` / `gemini.ts`) y extendida con Claude + detección de banco (`bank-detect.ts`, catálogo AR).
>
> **División de dinero:** el gate **extrae y detecta**; el PAM **decide y acredita** (match
> bancario, antifraude global, cola de operaciones). El gate nunca toca saldos.

## Estrategia multi-proveedor

OCR agnóstico de proveedor con cadena de fallback: **Claude (primario) → OpenAI → Gemini**.
Se usa el primer proveedor con API key configurada; ante fallo se cae automáticamente al siguiente.
Hoy el único key disponible en el ecosistema es **Anthropic Claude** (compartido con el CRM).

**Resultado del test real (43 comprobantes, Claude Haiku 4.5):**
- Saneo E0–E2: 42/43 aceptados (1 rechazado como `preview_receipt`)
- Extracción E3: **42/42 con IA** (monto, fecha, cuentas, entidad)
- Detección de banco E3b: **~86%** de acierto (los pocos misses son OCR garabateado,
  archivos mal nombrados, o MODO que agrega varios bancos — no gaps del catálogo)

## Módulos

| Archivo | Rol |
|---------|-----|
| `src/forensic/receipt-reader.ts` | Orquesta cadena Claude → OpenAI → Gemini; `runForensic` |
| `src/forensic/claude.ts` | Extractor Claude (primario, Messages API + tool-use) |
| `src/forensic/gemini.ts` | Extractor Gemini (fallback) |
| `src/forensic/validate.ts` | `validateExtraction` (alertas) + `isPreviewReceipt` + antigüedad |
| `src/forensic/normalize.ts` | Normalización **post-OCR** de cuentas: `normalizeOcrCbuStandalone` (CBU/CVU/alias) + checksum COELSA |
| `src/forensic/bank-detect.ts` | Catálogo AR (45 entidades, incl. DolarApp/ARQ) → canonical + kind + known |
| `src/forensic/config.ts` | Umbrales: $500–$10M, confianza 0.7, 48h |

### estado_comprobante = "pendiente" (dep #179/#180, DolarApp/ARQ)

DolarApp/ARQ muestra un estado intermedio `PENDIENTE` post-transferencia (clearing en curso): el
usuario ya envió el comprobante (tiene número de operación + fecha) pero todavía no está
acreditado. El modelo antes solo tenía `confirmado | preview | desconocido` y, ante la duda,
elegía `preview` → el gate lo rechazaba como si fuera una pantalla previa a confirmar (falso
rechazo, dep #179/#180).

Se agregó **`estado_comprobante: "pendiente"`** al esquema (Claude tool + OpenAI json_schema) y a
`isPreviewReceipt` (`src/forensic/validate.ts`): `pendiente` **nunca** se trata como preview. En
su lugar, `validateExtraction` agrega la alerta informativa `COMPROBANTE_PENDIENTE` — el gate no
rechaza ni decide; el PAM ve la alerta y decide (ej. cola de espera hasta la acreditación, o
aceptar igual con el número de operación como prueba). Diferencia clave para el modelo:
`pendiente` **ya tiene** número de operación/fecha (el envío ya ocurrió); `preview` **no los
tiene** (el usuario todavía no confirmó el envío).

> Gemini (fallback) no extrae `estado_comprobante` hoy (siempre `confirmado`/`desconocido` según
> `is_valid_receipt`) — no reproduce el bug de "preview", así que no se tocó. Si se detecta el
> mismo falso positivo vía Gemini, extenderlo ahí también.

### E3d — Normalización post-OCR de cuentas (dep #178 DolarApp/ARQ)

Después del OCR (E3) y **antes** de validar/guardar, el gate normaliza `cuenta_receptora` y
`cuenta_emisora` con `normalizeOcrCbuStandalone` (port de PAM `receipt-extraction-normalize.ts`,
doc PAM `GATE-CBU-NORMALIZE.md`). Saca separadores basura, corrige confusiones OCR letra→dígito
(O→0, I/l→1, S→5, B→8) **solo** si el resultado son 22 dígitos exactos (CBU/CVU), y deja los
alias intactos. Como la extracción se guarda ya normalizada, tanto `POST /scan` como
`GET /scans/:id` devuelven la cuenta destino saneada. El gate **no decide** con eso: el PAM
contrasta la cuenta destino contra las cuentas nuestras. `cbuChecksumValid` (dígito verificador
COELSA) queda disponible como señal informativa.

## Qué hace E3 sobre el JPEG limpio

## Qué es la Capa 2

Verificación de **veracidad financiera** sobre un comprobante **ya saneado** (JPEG limpio del gate):

| Función | Detalle |
|---------|---------|
| **Lectura de monto** | IA (`receipt-reader`, Claude→OpenAI→Gemini): extrae importe, fecha, código op, cuentas |
| **Match bancario** | Cruce con movimientos reales del casino |
| **Detección de edición** | `signos_edicion`, forense de imagen |
| **Antigüedad** | `MAX_RECEIPT_AGE_HOURS` (48h en PAM hoy) |
| **Anti-fraude global** | Dedup **cross-cuenta** (el gate solo deduplica por `subject_id`) |
| **Decisión** | Acreditar → `deposit.accepted` / rechazar → `deposit.rejected` |

## Qué NO hace (ya lo hizo Capa 1)

- Antivirus, normalización JPEG, strip metadata
- Anti image-bomb / tamaño / dimensiones
- Dedup por lead/subject (complementar con global en Capa 2)

## Garantías que Capa 2 puede asumir del gate

Todo JPEG que sale de `POST /scan` con `status: accepted`:

- Es `image/jpeg` válido, re-encodeado (mozjpeg 85), ≤2000px lado máximo
- Sin EXIF/XMP/ICC; orientación ya aplicada
- Escaneado ClamAV (prod)
- No duplicado para ese `subject_id` (pHash, Hamming ≤5)
- Pasó rate-limit del gate

## Constantes PAM (confirmar vigencia)

De `CRM/docs/01_INTEGRACION_PAM.md`:

| Constante | Valor |
|-----------|-------|
| MONTO_MINIMO | 500 |
| MONTO_MAXIMO | 10.000.000 |
| CONFIANZA_MINIMA | 0.7 |
| MAX_RECEIPT_AGE_HOURS | 48 |

## Contrato post-gate → PAM (`register_deposit`)

**Target** (cuando CRM/PAM usen el gate HTTP):

```json
{
  "action": "register_deposit",
  "telefono": "+549...",
  "username": "juanperez",
  "bonus_type": "publi_100",
  "receipt_base64": "<base64 CRUDO de JPEG LIMPIO del gate>",
  "phash": "f1e2a3...",
  "client_op_id": "op_uuid_crm",
  "store_slug": "redgg",
  "origen": "crm"
}
```

- `receipt_base64`: **sin** prefijo `data:` (F9)
- `phash`: reutilizar el del gate (mismo algoritmo dHash) para dedup global en PAM
- PDF: gate entrega solo **1ª página** rasterizada (F10 — confirmar con PAM)

Respuesta acuse: `{ "ok": true, "deposit_id": "dep_123" }`.
Resultado async: `deposit.accepted` / `deposit.rejected` con `deposit_id`.

## Dónde vive la Capa 2 — DECIDIDO

**E3 (extracción + detección de banco) vive en el gate.** El PAM conserva la **decisión de
dinero**: match bancario, antifraude global cross-cuenta, acreditación y cola de operaciones.

| Etapa | Dónde | Estado |
|-------|-------|--------|
| E0–E2 (sanitizar + pHash) | Gate | ✅ |
| E3 (OCR: monto, fecha, cuentas, código) | Gate | ✅ |
| E3b (detección de banco/fintech) | Gate | ✅ |
| E3c (validación + preview detection) | Gate | ✅ |
| E4 (match bancario, antifraude global, acreditar) | **PAM** | en PAM (otra instancia) |

Racional: la IA forense trabaja sobre **píxeles limpios** (sin RCE), así que centralizarla en el
gate da **un solo OCR** para los 3 canales (CRM-livechat, CRM-WhatsApp, PAM-panel). Lo que **no**
se mueve: credenciales bancarias, saldos y la UI del operador → quedan en el PAM.

## Checklist Capa 2 (PAM o gate)

- [ ] Decodificar `receipt_base64` como JPEG limpio (sin prefijo `data:`)
- [ ] IA lectura: monto, fecha, código, cuentas, confianza, signos edición
- [ ] Match bancario
- [ ] Anti-fraude cross-cuenta (reusar `phash` del gate)
- [ ] Idempotencia `client_op_id` (F11)
- [ ] Eventos `deposit.accepted` / `deposit.rejected` con `deposit_id`
- [ ] Lista `rejection_code` acordada con CRM (copys al cliente)
- [ ] Confirmar 1ª página PDF alcanza (F10)

## Referencia CRM (handoff viejo)

`CRM/docs/pam/05_CAPA_1_COMPROBANTES.md` — útil para división Capa 1↔2, pero asume Capa 1 en CRM.
Usar este doc + `05_INTEGRACION_CRM_PAM.md` como fuente actualizada.
