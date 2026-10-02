# Sinergia CRM ↔ GATE ↔ PAM

> **Documento canónico de integración.** Describe qué hace **GATE**, cómo viaja un
> comprobante desde cada origen, y exactamente qué necesitamos del CRM y del PAM para cerrar
> la sinergia entre los 3 códigos.
>
> Estado verificado contra código real (jun 2026): **integración cerrada en los 3 repos.**
> El gate expone el contrato **v1 CONGELADO** (§2); el CRM es transporte HTTP puro y reenvía
> `scan_id` + metadata; el PAM consume el gate (lee por `scan_id`, sin OCR propio) y sirve la
> vista por proxy Bearer. Falta solo el **E2E conjunto** y el **deploy a test**.

---

## 0. Principio rector — el gate **rige la lógica del comprobante**

Tenemos acceso a los 3 repos, así que el objetivo **no** es "ser compatible con lo que el CRM y
el PAM ya hacen", sino lo contrario: **centralizar toda la lógica del comprobante en el gate y
eliminar la duplicada en CRM/PAM.** Un solo lugar dueño de la verdad → sin doble costo de IA, sin
lógica que se desincroniza entre repos, sin parsers riesgosos en el PAM.

**El gate es la autoridad de todo lo que es "el comprobante como artefacto":**
captura universal, antivirus, saneo, dedup (perceptual + global), extracción IA, detección de
banco, detección de preview/edición y vista segura.

**El PAM es la autoridad de todo lo que es "el dinero":** match contra movimientos bancarios
reales (PSP), acreditación de saldo, bonos, cola y decisión del operador.

**El CRM es solo transporte/conversación:** recibe el archivo por WhatsApp/livechat y lo entrega
al gate; no sanea, no extrae, no deduplica.

> Regla de corte simple: **si para decidirlo hace falta mirar la plata real del casino → es PAM.
> Si alcanza con mirar la imagen del comprobante → es el gate.**

### Una frase

Cualquier archivo —entre por el CRM o por el PAM— pasa **primero** por el gate, que devuelve un
**JPEG limpio**, su **huella** (pHash + SHA-256), los **datos extraídos** (monto, fecha, cuentas,
banco), el **veredicto del comprobante** (válido / preview / editado / duplicado) y un **link
seguro de vista**. El PAM solo recibe ese resultado y decide el dinero.

```
                          ┌─────────────────────────────┐
   CRM (WhatsApp/livechat) │                             │
   ──────────────────────► │           GATE              │
                          │   (host aislado, sacrificable)│
   PAM (panel del cliente) │                             │
   ──────────────────────► │  E0 antivirus               │
                          │  E1 validación              │ ──► JPEG limpio
                          │  E2 saneo (re-encode/strip)  │ ──► pHash + SHA-256
                          │  E3 extracción IA (Claude)   │ ──► monto/fecha/cuentas
                          │  E3b detección de banco      │ ──► banco canónico
                          │  + link seguro de vista      │ ──► view_url
                          └─────────────────────────────┘
                                        │
                                        ▼
                         PAM Capa 2: decide el dinero
                    (match PSP / cola operador / acreditación)
```

---

## 1. Qué hace el programa (funciones en detalle)

El gate procesa cada archivo en un pipeline de etapas. Cada etapa puede **rechazar** (mensaje
para el usuario), **fallar** (error técnico) o **pasar** a la siguiente.

| Etapa | Nombre | Qué hace | Resultado |
|-------|--------|----------|-----------|
| **E0** | Antivirus | ClamAV sobre los bytes crudos. En prod `failClosed` (si ClamAV no está, rechaza). | `infected` → rechazo |
| **E1** | Validación | Tamaño **[3 KB, 10 MB], límites incluidos**, MIME real (no el declarado), dimensiones, rate-limit por `subject_id`. | `too_small` / `too_large` / `bad_type` / `dimensions` / `rate_limited` |
| **E2** | Saneo | PDF→PNG (poppler), re-encode a **JPEG**, **strip de metadata** (EXIF/GPS), downscale. Mata cualquier payload escondido. | JPEG limpio + `mime` |
| **E2b** | Huellas | **pHash** (dedup perceptual por sujeto) + **SHA-256** (dedup global exacto / fraude cross-cuenta). Señal `duplicate_global` cross-subject: sha256 exacto **o** pHash cercano + contenido corroborado (#258). | `phash`, `sha256`, `duplicate_global` |
| **E3** | Extracción IA | OCR estructurado sobre el JPEG limpio. Cadena **Claude → OpenAI → Gemini**. Extrae monto, fecha, código op, cuentas, entidad, COELSA, confianza, signos de edición. | `extraction` |
| **E3b** | Detección banco | Normaliza `entidad_emisora` contra catálogo AR curado (44 entidades) → nombre canónico + tipo + `known`. | `bank` |
| **E3c** | Validación forense | Detecta **preview** (pantalla previa a confirmar), comprobante inválido, alertas (baja confianza, edición, falta de datos). | `validation`, posibles rechazos |
| **E4** | Vista segura | Guarda el JPEG en disco y emite `view_url` con token HMAC + TTL para que el operador lo vea. | `view_url`, `view_token`, `scan_id` |

**Lo que el gate NO hace** (es del PAM): match contra movimientos bancarios reales (PSP),
acreditar saldo, aplicar bonos, decidir aprobación/rechazo final del dinero.

> Profundidad por capa: `docs/02_CAPA_1.md` (E0–E2) y `docs/03_CAPA_2.md` (E3–E3b).

**Los bordes exactos de E1, medidos en el contenedor de prod (28/08), porque el mínimo faltaba acá y
CRED tuvo que preguntarlo:** `minBytes = 3072` y `maxBytes = 10485760`, los dos **hardcodeados** en
`src/gate/config.ts` — ninguna variable de entorno los pisa. Las comparaciones son `< min` y `> max`,
así que **los valores límite se aceptan**: 3072 bytes pasa el tamaño (y cae en `bad_type` si no es
imagen), 3071 da `too_small`; 10485760 pasa, 10485761 da `too_large`.

> **`too_large` tiene una franja angosta y arriba de ella contesta otra capa.** El límite de body de
> Express es `maxBytes × 1,4 + 256 KB` ≈ 14,25 MB de **JSON**, y base64 infla 1,33×, así que un
> archivo de más de ~10,7 MB recibe **HTTP 413 sin que E1 corra**. Un vector de "archivo gigante" de
> 20 MB prueba Express, no el gate: para ejercitar `too_large` hay que quedarse entre 10 MB + 1 byte y
> ~10,7 MB. Medido, no calculado: 12 MB ya da 413 y no deja línea en la traza.

---

## 2. Contrato del gate (lo que ya existe)

### `POST /scan` — núcleo

**Auth:** `Authorization: Bearer <token>` (obligatorio en producción; un token distinto por cliente).

**Request:**
```jsonc
{
  "subject_id": "lead-uuid | telefono | user-id",  // OBLIGATORIO — clave de dedup + rate-limit
  "phone": "+549...",                               // opcional
  "channel": "crm_whatsapp | crm_livechat | pam_panel | pam_store | other", // opcional
  "declared_mime": "image/jpeg",                    // opcional (el gate detecta el real igual)
  "filename": "comprobante.jpg",                    // opcional
  "data_base64": "<bytes del archivo crudo>"        // OBLIGATORIO
}
```

**Response `accepted`:**
```jsonc
{
  "status": "accepted",
  "scan_id": "uuid",                  // referencia estable de la operación
  "mime": "image/jpeg",
  "phash": "a1b2c3...",               // dedup perceptual (compat CRM)
  "sha256": "7689a1...",              // dedup global exacto
  "clean_base64": "<JPEG limpio b64>",// para reenviar a register_deposit (compat CRM/PAM)
  "view_url": "https://gate/receipts/{scan_id}?token=exp.sig", // link seguro de vista
  "view_token": "exp.sig",
  "extraction": {                     // datos leídos por IA (null si E3 skipped)
    "monto": 50000, "fecha": "2026-06-29 14:03:00",
    "codigo_operacion": "...", "nombre_emisor": "...",
    "cuenta_emisora": "...", "cuenta_receptora": "...",
    "cuenta_emisora_checksum_valid": true,   // v1.2 aditivo: checksum CBU/CVU (true|false|null=no aplica)
    "cuenta_receptora_checksum_valid": null,  // GATE NO anula; PAM decide con su extracto (#444)
    // ↑ Las dos claves SIEMPRE VIAJAN mientras `RECEIPT_SANITIZE_INVALID_CBU=true`, incluso con
    //   valor null. No es prolijidad: PAM tiene una alarma en prod (su PR #615) que mide la
    //   PRESENCIA de la clave para enterarse si el flag se apaga sin aviso. Omitir los null haría
    //   sonar esa alarma como si el flag estuviera apagado. Lo fija `npm run test:checksum`.
    //
    //   Y qué significa `false`: es ARITMÉTICA (algoritmo COELSA sobre los 22 dígitos), no una
    //   opinión del modelo — el schema que se le manda ni declara estos campos. Pero se calcula
    //   sobre los dígitos QUE EL OCR LEYÓ, no sobre la cuenta real. Así que `false` dice "los
    //   dígitos que te estoy mandando no son un CBU/CVU válido", que casi siempre significa que la
    //   cuenta está bien y yo la leí mal. No es un veredicto sobre la cuenta del comprobante.
    //
    //   v1.5 (13/08, MSG-PAM-20260813-26): `cuenta_emisora` / `cuenta_receptora` salen `null`
    //   cuando el valor NO es una cuenta (CUIT, nombre de persona, `<UNKNOWN>`, etiqueta de banco,
    //   caja de ahorro). El flag en esos casos también es `null`. Así se distinguen:
    //     campo null + flag null           → no encontré la cuenta
    //     campo con dígitos + flag false   → leí mal un número (largo ≠ 22, checksum, o letra suelta)
    //   Un alias con punto y un CBU/CVU de 18–26 dígitos (aunque rotos) se conservan. Lo fija
    //   `npm run test:code-sanity` y `npm run test:checksum`. CRM lee el mismo `/scans/:id`.
    "entidad_emisora": "Mercado Pago", "tipo_operacion": "transferencia",
    "dia_semana": "Martes",             // v1.6 aditivo: día TAL CUAL lo imprime el comprobante (o null)
    "fecha_anio_sospechoso": false,     // v1.6 aditivo: true|false|null — ver el bloque de abajo
    "fecha_alternativa": null,          // v1.6 aditivo: fecha que implica el día impreso (o null)
    "confianza": 0.97, "signos_edicion": false,
    "es_comprobante_valido": true, "estado_comprobante": "confirmado"
  },
  "bank": { "canonical": "Mercado Pago", "kind": "billetera", "known": true },
  "receipt_age_hours": 6.42,           // v1.3 aditivo: antigüedad contra el reloj del GATE
  "validation": { "is_valid": true, "alerts": [] },
  "duplicate_global": {
    "seen": false,                    // ¿mismo comprobante/operación ya visto? (cross-subject)
    "via": null,                      // "sha256" | "phash_content" | null
    "cross_user": false,              // el match previo es de OTRO subject (reuso cross-user)
    "first_scan_id": null,            // scan_id del match previo más antiguo (siempre si seen)
    "count": 0,                       // cantidad de matches previos
    "match_fields": []                // ["sha256"] | ["coelsa_id"] | ["monto","fecha","cuenta_receptora"]
  },
  "forensic_status": "ok"             // ok | skipped
}
```

> **`duplicate_global` (señal anti-fraude, NO bloqueante — GATE no decide dinero).** `seen=true` cuando
> un scan previo (cualquier subject, **ventana real: 7 días** — ver el recuadro de abajo) matchea por: **(a)** `sha256` exacto
> (reuso literal de bytes) o **(b)** pHash Hamming ≤ umbral **Y** contenido corroborado por OCR
> (`coelsa_id` igual, o `monto` + `fecha` + `cuenta_receptora` iguales). El combo (b) detecta el reuso
> **re-comprimido** (sha256 distinto) incluido el **cross-user**, sin el falso positivo de dos clientes
> del mismo banco (mismo template ⇒ pHash cercano pero contenido distinto). PAM consume
> `cross_user` + `first_scan_id` y aplica la consecuencia (rechazo cross-user); `match_fields` va al
> motivo/nota de auditoría. Ref: #258 (CROSS-X01b), #220 (pHash per-subject no bloqueante).

> ### 🔑 Scopes por token (08/09) — **no cambia nada para CRM ni PAM, pero aparece un 403**
>
> `RECEIPT_GATE_SCOPES` acota qué rutas puede cada etiqueta de token (`etiqueta=scope[,scope]`).
> Scopes: `scan` · `read` · `stats` · `feedback` · `traza:feed`. Detalle en
> [12_TRAZA_FEED.md](12_TRAZA_FEED.md) § 6.
>
> **Los tokens de CRM y PAM no están listados, y una etiqueta sin entrada queda con acceso
> COMPLETO** — el comportamiento de siempre. No hay que hacer nada. Lo único nuevo en el contrato es
> que ahora existe la respuesta **`403 {error:"forbidden_scope", required_scope}`**, que antes no
> podía pasar. Si alguna vez la ven, es que su token quedó acotado por configuración, no que el
> pedido esté mal armado: es distinto de un `401` (token inválido) y de un timeout (allowlist).

> ### ⚠️ Lo que bloquea y lo que sólo avisa — leerlo antes de apoyar una defensa acá
>
> Son **dos dedups distintos** y la diferencia decide dinero. Demostrado con un comprobante real
> (05/09), no deducido del código:
>
> | escenario | respuesta de GATE |
> |---|---|
> | mismo `subject_id`, bytes idénticos | **`rejected` · `reason: duplicate`** |
> | **otro `subject_id`**, el mismo comprobante | **`accepted`** + `duplicate_global{via:"sha256", cross_user:true, first_scan_id}` |
>
> **El que RECHAZA está particionado por `subject_id`** (`listPhashesBySubject`) y sólo corta por
> `sha256` exacto: la similitud de pHash **nunca** bloquea. **El global no rechaza: informa.** Así que
> el mismo comprobante presentado bajo dos sujetos distintos —dos portales, dos `store_client_id` de
> la misma persona— **pasa el gate las dos veces**, y la única cosa que lo dice es el objeto
> `duplicate_global`. No sale en `validation.alerts` ni cambia el `status`: **quien no lea ese campo
> no se entera.** Consecuencia: la defensa contra ese fraude es de PAM; GATE aporta la evidencia.
>
> **La ventana es de 7 días, no de 30.** Las dos ramas resuelven contra `scan_records`, y esa tabla
> se purga en `expires_at = created + RECEIPT_VIEW_TTL_HOURS` (**168 h**, default del código y no
> seteada en prod). `phashTtlDays: 30` sólo acota la *consulta*: no puede alcanzar filas que ya se
> borraron. Medido en prod el 05/09: **0 filas de `scan_records` más viejas que 7 días**, contra
> `phash_comprobante` con 62 filas y la más vieja del 12/08 (31 ya fuera de la ventana). O sea que la
> memoria por sujeto sobrevive más que la global — al revés de lo que conviene para este riesgo.
> Un reuso a los 8 días **no se marca**. Seguimiento: `G-DEDUP-VENTANA` en `docs/ESTADO.md`.

> ### ⏱️ `extraction.fecha` y `receipt_age_hours` — la zona, escrita para que nadie la suponga
>
> **`fecha` es la hora impresa en el comprobante**, transcripta tal cual: formato
> `YYYY-MM-DD HH:MM:SS`, **hora argentina (UTC-3), sin sufijo de zona**. GATE **no la normaliza** —
> el prompt pide ese formato y el pipeline no toca el valor.
>
> **Consecuencia para el consumidor, y es del camino del dinero:** `new Date("2026-08-12 01:00:00")`
> en un proceso que corre en UTC interpreta esa cadena como **hora local del proceso**, o sea la lee
> **3 horas más vieja**. Una ventana de antigüedad de 48 h se vuelve de 45 h sin que nada avise.
>
> **`receipt_age_hours` (v1.3, aditivo) existe para sacar eso del camino:** la edad la calcula GATE
> interpretando `fecha` en UTC-3 explícito y midiendo contra su propio reloj, así que el consumidor
> no depende de su `TZ`. Detalles que importan:
> - `null` si no hay `fecha` o no es parseable. **Un `null` acá NO significa "fresco"**: significa
>   que la edad no se pudo determinar, y esa es una decisión del consumidor, no una ausencia de dato.
> - **Puede ser negativo** si el comprobante trae fecha futura. Se emite tal cual: es una señal.
> - Si el modelo devolviera la fecha con zona explícita (`Z` u offset), esa manda.
> - Sin hora (sólo fecha) se toma **00:00 ART**, el instante más viejo del día, para que el sesgo
>   caiga del lado de revisar y no del de acreditar.
> - Se calcula **al momento de la respuesta**, en `POST /scan` y en `GET /scans/:id`. En el segundo
>   crece con el tiempo, porque contesta *"qué antigüedad tiene ahora"*.
>
> **GATE no aplica ninguna regla de antigüedad**: `MAX_RECEIPT_AGE_HOURS` no tiene llamadores. La
> decisión de las 48 h vive en PAM. Ref: `MSG-PAM-20260812-8` §6 · `npm run test:receipt-age`.

> ### 📅 v1.6 — el año de `fecha`, y por qué el comprobante lo verifica solo (issue #36)
>
> **El caso.** 25/08/2026 22:36, comprobante Mercado Pago del día, subido por el CRM a prod. GATE
> emitió `fecha = "2025-08-25 22:36:00"`: **año −1, sobre un año que está impreso y legible**. PAM
> calculó 8763 h de antigüedad y mandó el depósito a revisión manual. La regla de 48 h funcionó
> perfecto; la entrada era falsa.
>
> Medido antes de tocar nada, sobre la misma imagen: con el prompt viejo el año salía mal **5 de 5
> corridas** a `temperature 0`. No era un mal día del modelo, era determinista. El prior del modelo
> sobre "en qué año estamos" viene de su entrenamiento y le pisa un dígito escrito.
>
> **Tres campos aditivos, y ninguno toca `fecha`:**
>
> | campo | qué es |
> |---|---|
> | `dia_semana` | El día **tal como lo imprime el comprobante** ("Martes"), o `null` si no lo imprime. Es la evidencia, no el veredicto. |
> | `fecha_anio_sospechoso` | `true` = el día impreso no calza y un cambio de año lo explica → **el año está mal leído**. `false` = el día calza, **el año quedó corroborado por el propio comprobante**. `null` = no hubo con qué cruzar (sin `fecha` o sin día impreso), o el día no calza y ningún año cercano lo explica. |
> | `fecha_alternativa` | La fecha que implica el día impreso. `null` si no hay una sola candidata. **GATE no la promueve.** |
>
> Alertas nuevas en `validation.alerts`: `FECHA_ANIO_SOSPECHOSO:` · `FECHA_INCONSISTENTE:` (el día no
> calza y ningún año lo explica) · `FECHA_FUTURA:` (posterior al scan; imposible).
>
> **`fecha` sigue saliendo cruda, siempre.** Es deliberado y es la misma lección que PAM sacó del
> episodio del checksum al revés: PAM guardaba el CBU *corregido* al lado de un flag calculado sobre
> el crudo, y eso dejó su propio error invisible un día entero porque el par no era auditable. Si yo
> "corrijo" el año en el campo que PAM usa para las 48 h, el consumidor pierde la forma de auditarme
> — y peor, un comprobante viejo reusado podría salir rejuvenecido por GATE. **GATE no decide dinero.**
> El crudo va en `fecha`, la candidata en `fecha_alternativa`, y el consumidor decide con los dos.
>
> **Lo que NO se implementó, a propósito:** marcar como sospechoso todo comprobante que parezca de
> hace exactamente un año. Atajaría también los que no imprimen el día, pero no tiene evidencia en la
> imagen y sólo puede empujar en una dirección —*"este comprobante viejo en realidad es de hoy"*—, que
> es la que acredita plata. Un comprobante del año pasado reusado en el aniversario la dispararía
> igual que un misread. El día impreso, en cambio, es un dato del comprobante.
>
> **Para el consumidor, sin vueltas:** lo que saca el falso positivo de la cola del operador es el
> prompt (año bien leído, medido 5/5). Los tres campos son la red para el próximo: hasta que PAM
> consuma `fecha_anio_sospechoso`, un año mal leído sigue llegando como `COMPROBANTE_VIEJO` de su
> lado. La diferencia es que ahora queda **visible y consultable** en vez de silencioso.
>
> Ref: issue #36 · `npm run test:fecha-sanity` (47 casos) · `npm run exp:fecha-anio` (la medición,
> cuesta llamadas de IA) · `src/forensic/fecha-sanity.ts`.

**Response `rejected`** (el usuario debe reintentar): `{ status, reason, user_message }`

| `reason` | Cuándo | Notas CRM |
|----------|--------|-----------|
| `preview_receipt` | Pantalla previa a confirmar (`estado_comprobante: preview` o heurística) | Copy “antes de confirmar”. **Cualquier otro `reason` no es preview.** |
| `receipt_no_sender` | Cuenta DNI (y catálogo `bank.canonical` = `"Cuenta DNI"`) post-éxito confirmado, destino OK, **sin** emisor | Aditivo 24/09/2026 · MSG-CRM-20260924-1. CRM usa matcher propio; GATE no emite copy de preview. |

**Response `failed`** (error técnico, HTTP 502): `{ status, step, error }`

> ### 🔒 Contrato v1 CONGELADO (estable para test/deploy)
>
> Estos campos **no cambian de nombre ni de forma** sin aviso y bump de versión. CRM y PAM
> pueden depender de ellos:
> - **`POST /scan` (accepted):** `scan_id, mime, phash, sha256, clean_base64, view_url,
>   view_token, extraction{…}, bank{canonical,kind,known}, validation{is_valid,alerts},
>   duplicate_global{seen,via,cross_user,first_scan_id,count,match_fields}, forensic_status('ok'|'skipped')`.
>   *(v1.1: `duplicate_global` sumó `via`/`cross_user`/`match_fields` — aditivo, no rompe consumidores.)*
>   *(v1.3: sumó `receipt_age_hours` — aditivo. **Live sólo en gate-test** hasta que PAM confirme que
>   su parseo tolera el campo nuevo; no se sube a prod antes de eso porque es una ruta con plata real.)*
> - **`GET /scans/:id`:** misma forma semántica (`extraction, bank, validation, duplicate_global,
>   forensic_status, view_url, created_at, expires_at, subject_id, channel`) — **sin** `clean_base64`.
> - `validation` es **`{ is_valid, alerts }`** (snake_case) en **ambos** endpoints. Verificado en código.
> - **`view_url`** trae token HMAC con TTL (`RECEIPT_VIEW_TTL_HOURS`) y `GET /scans/:id` **re-emite
>   uno fresco** en cada llamada. Es **informativo**: para la vista del operador usar **siempre el
>   proxy Bearer** (`GET /receipts/:id` con `Authorization`), que no vence.

### Otros endpoints

| Endpoint | Auth | Para qué |
|----------|------|----------|
| `GET /scans/:scanId` | Bearer | Metadata de una operación (extraction + bank + view_url). Útil para que el PAM re-consulte sin re-OCR. |
| `GET /receipts/:scanId?token=...` | Token HMAC **o** Bearer | Devuelve el JPEG limpio. Query-token para links efímeros; Bearer para que el backend del PAM lo proxee. |
| `POST /scans/:scanId/feedback` | Bearer | **Base que aprende (PTMUAT-414 c, aditivo).** PAM postea el código REAL cuando el match PSP cierra. GATE lo usa para eval/regresión del OCR. NO cambia `/scan` v1.1. |
| `GET /health` | — | Capacidades del host + `ai_configured`. Lo consume el panel de stats del CRM. |
| `GET /stats` | Bearer | Métricas (aceptados/rechazados/fallas). |

#### `POST /scans/:scanId/feedback` — feedback del OCR de códigos (aditivo, v1.1 intacto)

Canal para que el PAM devuelva el "era en realidad" del `codigo_operacion`/`coelsa_id` cuando el
match contra el espejo PSP cierra. GATE deriva lo que leyó (de la extracción guardada), guarda una
copia retenida del comprobante para evaluación y acumula la corrección. **No decide dinero ni altera
el contrato `/scan`.** Complemento por lote: import CSV/JSON para histórico (`npm run ocr-eval:import`).

```
POST /scans/:scanId/feedback   (Bearer)
{
  "code_truth": "L18MKX9RPXVMQKMV2O6WYV",   // requerido: el código real
  "field": "coelsa_id",                       // opcional: codigo_operacion | coelsa_id (default: auto)
  "code_read": "L18MKX9RPXVMQKMV20GWVV",     // opcional: lo que GATE leyó (si el scan ya expiró)
  "source": "endpoint",                       // opcional: endpoint | batch | manual
  "note": "match PSP #439"                    // opcional: traza de auditoría
}
→ 200 { ok, field, exact_match, confusion_class, image_retained, scan_found }
```

Cuándo llamarlo: al cerrar el match PSP (típicamente < TTL del scan → se retiene la imagen). Idempotente
por `(scan_id, field)`.

### Contrato target: `scan_id` como clave de correlación

En el diseño ideal, **`scan_id` es el identificador único de comprobante que atan los 3 sistemas**.
Quien procesa el archivo (CRM o PAM) llama a `/scan` **una sola vez** y obtiene `scan_id`. A partir
de ahí, nadie reenvía el archivo: el PAM **lee** del gate por `scan_id`.

```
register_deposit (CRM → PAM), versión eficiente:
{ telefono, username, bonus_type, store_slug, client_op_id, scan_id }   ← sin base64

Luego el PAM, con su Bearer:
  GET /scans/:scan_id     → { extraction, bank, validation, duplicate_global, view_url }
  GET /receipts/:scan_id  → JPEG limpio (solo si quiere persistirlo)
```

**Ventajas:** un solo OCR (lo hizo el gate), no se duplica el base64 en cada hop, el PAM ve
exactamente lo que el gate produjo, `scan_id` da idempotencia natural, y el gate queda como única
fuente de verdad. `clean_base64` sigue existiendo en la respuesta de `/scan` como **modo de
transición** (para no bloquear la migración), pero el target es pasar `scan_id`.

---

## 3. Protocolo: comprobante que entra por el CRM

**Origen:** cliente manda foto/PDF por WhatsApp o livechat.

```
Cliente → WhatsApp/Livechat
   │  (Kommo / widget)
   ▼
CRM message-handler → receipt-ingest (data URL → Buffer)
   │  límite de tamaño en borde (anti memory-bomb)
   ▼
CRM brain (cs_carga_recurrente) → scanReceipt()
   │  POST /scan  { subject_id: lead.id, phone, declared_mime, filename, data_base64 }
   ▼
GATE  (E0…E4)
   │  accepted → { clean_base64, phash, [scan_id, extraction, bank, view_url] }
   ▼
CRM → pam.registerDeposit({ receipt_base64: clean, phash, telefono, username,
                            bonus_type, store_slug, client_op_id, [scan_id, view_url, extraction] })
   ▼
PAM webhook register_deposit → Capa 2 → match PSP → acredita / cola operador
```

**Hoy ya funciona** (livechat) con el contrato mínimo (`clean_base64` + `phash`). WhatsApp es
un stub pendiente (Fase WP: descargar `mediaUrl` con auth Kommo → Buffer, mismo flujo).

**Estado del CRM** (verificado): tiene un facade dual `RECEIPT_GATE_CLIENT=http|local`. En `http`
manda los bytes al gate y **no sanea localmente**. En `local` corre el pipeline embebido (legacy/dev).

---

## 4. Protocolo: comprobante que entra por el PAM (panel del cliente)

**Origen:** el cliente sube el comprobante directo desde el panel/tienda del PAM.

```
Cliente → Panel PAM (DepositModal / StoreDepositForm)
   │  POST /api/payments/upload  (multipart)  ← AQUÍ se inserta el gate
   ▼
PAM backend → POST /scan al gate  { subject_id: user.id|telefono, channel: "pam_panel", data_base64 }
   │  accepted → { scan_id, clean_base64, phash, extraction, bank, view_url }
   ▼
PAM guarda el JPEG limpio (no el original) + scan_id + view_url
   ▼
PAM Capa 2 / deposit-pipeline
   │  Opción A (mínima): re-OCR propio como hoy
   │  Opción B (target): consume `extraction`+`bank` del gate → NO re-OCR (evita doble costo)
   ▼
match PSP (hg/riven) → acredita  |  sin match → cola operador
   ▼
Operador en /panel/payments ve el comprobante vía view_url (no public /uploads)
```

**Hoy el PAM NO llama al gate:** guarda los bytes crudos en `public/uploads/` y corre su propio
OCR (OpenAI/Gemini). El operador ve la imagen con `<img src="/uploads/...">` **sin auth ni token**.

---

## 5. Qué le pedimos al CRM

Rol final del CRM: **transporte puro**. Recibe el archivo, lo manda al gate, reenvía el
`scan_id` al PAM. No sanea, no deduplica, no extrae.

| # | Cambio | Archivo CRM | Tipo |
|---|--------|-------------|------|
| C1 | `RECEIPT_GATE_CLIENT=http` + `RECEIPT_GATE_URL` + `RECEIPT_GATE_TOKEN` en prod | `.env` / `config/env.ts` | Activar |
| C2 | Capturar `scan_id` (y opcional `view_url`) de la respuesta de `/scan` y mandarlo en `register_deposit` | `receipt-gate/client.ts`, `pam/types.ts`, `core/brain.ts` | Agregar |
| C3 | **Eliminar el gate local embebido** (`receipt-gate/receipt-gate.ts`, `db/phash.ts`): la sanitización y el dedup viven solo en el gate | `receipt-gate/` | **Quitar** |
| C4 | WhatsApp: descargar `mediaUrl` con auth Kommo → Buffer → gate (Fase WP) | `receipt-ingest/wp.ts` | Agregar |
| C5 | Llamar al gate también en `primera_carga` (hoy solo `cs_carga_recurrente`) | `core/brain.ts` | Agregar |

**Conservar en el CRM** (es su rol legítimo): límite de tamaño en el borde (anti memory-bomb),
telemetría (`comprobante_rechazado` mapeando `reason` del gate) y la **guarda de identidad**
(username antes de tocar el PAM). Todo lo demás (saneo, pHash, clasificación) sale del CRM.

---

## 6. Qué le pedimos al PAM

Rol final del PAM: **solo el dinero**. Recibe del gate un comprobante ya saneado, leído y
validado, y decide acreditación/match/operador. Deja de tener lógica de comprobante propia.

> **Decisión confirmada (2026-06-29):** el PAM **borra su OCR propio** (OpenAI/Gemini) y confía
> 100% en la extracción del gate (Claude). Fuente única de verdad, sin doble costo de IA.

### 6.1 Lógica que el PAM **deja de hacer** (la asume el gate)

| Lo que hoy hace el PAM | Archivo PAM | Por qué sale |
|------------------------|-------------|--------------|
| OCR propio (OpenAI/Gemini) | `lib/receipt-reader.ts`, `lib/gemini.ts` | El gate ya extrae → evitar **doble costo IA** y drift |
| Detección de preview | `isPreviewReceipt` en `receipt-reader.ts` | El gate ya lo hace (E3c) |
| Dedup de imagen (SHA-256 / pHash store-scoped) | `image_hashes`, `paybot_receipt_phash` | El gate da `sha256` + `duplicate_global` |
| Saneo / conversión PDF→PNG | `normalizeToImage`, `pdfBufferToPngBuffer` | El gate sanea (sin parsers riesgosos en el PAM) |
| Guardar bytes crudos en `public/uploads` | upload routes | El gate guarda el JPEG limpio + sirve la vista |

### 6.2 Lógica que el PAM **conserva** (es del dinero)

Match PSP (`hg-match` / `riven-flow-match`), `creditDepositBalance`, bonos, cola del operador,
modos `manual`/`prueba`/`automatico`, y las **reglas de negocio del depósito** (monto min/max,
antigüedad, **CBU/cuenta destino = una cuenta nuestra**) — esto último necesita conocer nuestras
cuentas, así que vive en el PAM. El gate provee los datos (monto, fecha, `cuenta_receptora`); el
PAM los **contrasta contra la plata real**.

### 6.3 Cambios concretos

| # | Cambio | Punto en el PAM | Prioridad |
|---|--------|------------------|-----------|
| P1 | Subida del panel/tienda → llamar a `/scan` **antes** de cualquier cosa; guardar el `scan_id` y el JPEG limpio (no el original) | `api/payments/upload`, `api/stores/[slug]/payments/upload` | Alta |
| P2 | `register_deposit` acepta `scan_id` y lee del gate (`GET /scans/:id`) en vez de re-procesar; `receipt_base64` queda como fallback de transición | `lib/paybot/actions.ts` | Alta |
| P3 | `deposit-pipeline` consume `extraction`+`bank`+`validation` del gate; **borra** la llamada a `analyzeReceiptFromPath` | `lib/deposit-pipeline.ts`, `lib/payments.ts` | Alta |
| P4 | Si `forensic_status != ok` o `confianza` baja → mandar a **cola del operador** (no acreditar) | `lib/payments.ts` | Alta |
| P5 | Operador ve el comprobante por **proxy Bearer** al gate, no por `/uploads/...` público | `components/ReceiptViewer.tsx`, `PaymentRequestTable.tsx` | Media |
| P6 | Fail-closed: si el gate no responde → encolar + reintentar, nunca acreditar a ciegas | upload routes + worker | Alta |

### Detalle P5 — cómo ve el operador el comprobante

Recomendado: **proxy Bearer**. El PAM guarda solo `scan_id`; cuando el operador abre la ficha, el
backend del PAM hace `GET /receipts/:scan_id` con su Bearer y streamea la imagen. No expira, el
gate nunca queda expuesto a internet y el acceso queda detrás del auth del PAM. (Alternativa
simple: guardar el `view_url` firmado, pero su token vence según `RECEIPT_VIEW_TTL_HOURS`.)

---

## 7. Convención `subject_id` + `channel`

`subject_id` es la **clave de deduplicación y rate-limit**. Debe ser estable por persona.

| Canal | `channel` | `subject_id` sugerido |
|-------|-----------|------------------------|
| Livechat (CRM) | `crm_livechat` | `lead.id` (UUID del CRM) |
| WhatsApp (CRM) | `crm_whatsapp` | `lead.id` (UUID del CRM) |
| Panel cliente (PAM) | `pam_panel` | `user.id` del PAM |
| Tienda/FRAME (PAM) | `pam_store` | `store_client_id` del PAM |
| Otro / test | `other` | lo que aplique |

> **Prefijo de entorno de PAM (live en prod desde 12/08 07:04 UTC, `MSG-PAM-20260812-9`).** PAM
> prefija con su entorno: `prod:store_<id>` · `prod:user_<id>` (y `test:` / `dev:` en los suyos).
> GATE lo trata como cualquier string: **no cambia el contrato**, pero **sí cambia la identidad de
> dedup y de rate-limit**, porque las dos son por `subject_id` literal. Consecuencias medidas el
> 12/08 en la base de prod: 3 scans, todos `prod:store_130`, **0 sujetos sin prefijo y 0 choques**
> del mismo id con y sin prefijo — el wipe de las 03:00 dejó la base en cero, así que el corte de
> identidad no costó nada. **Efecto lateral bueno:** PAM test y PAM dev, que comparten host en
> gate-test, dejan de compartir cubeta de rate-limit y de pHash por sujeto si cada uno usa su
> prefijo. Esto **corrige** lo que GATE afirmó en `MSG-GATE-20260812-1` (que test y dev compartían
> esa cubeta): con prefijo distinto, ya no.

> **Decisión pendiente (G2):** ¿se unifica la clave entre canales? El dedup **perceptual (pHash)**
> es por `subject_id` (no cruza canales). El dedup **global (SHA-256)** sí cruza todo y sirve para
> detectar la misma imagen reusada en cuentas distintas (fraude) — ese dato va en `duplicate_global`
> y lo evalúa el PAM. Recomendación: dejar `subject_id` por-canal y apoyarse en SHA-256 global
> para el cruce, en vez de forzar una clave compartida CRM/PAM.

---

## 8. Seguridad y red

- **Tokens:** `RECEIPT_GATE_TOKENS=<token-crm>,<token-pam>` (uno por cliente, Bearer timing-safe).
- **Al cliente nunca el original:** el gate solo entrega el JPEG re-generado.
- **ClamAV fail-closed** en prod.
- **Red:** el gate es accesible **desde** CRM y PAM; el gate **no** tiene acceso al PAM ni a sus BD.
  Host sacrificable, separado.
- **Parsers (poppler/sharp) = riesgo RCE** → sandbox efímero por archivo (pendiente infra, F4/G5).

```bash
# Gate (host aislado)
RECEIPT_GATE_TOKENS=<crm-secret>,<pam-secret> docker compose up -d
# CRM .env
RECEIPT_GATE_CLIENT=http
RECEIPT_GATE_URL=https://gate.internal:4100
RECEIPT_GATE_TOKEN=<crm-secret>
# PAM .env
RECEIPT_GATE_URL=https://gate.internal:4100
RECEIPT_GATE_TOKEN=<pam-secret>
```

---

## 9. Plan por fases (sin romper nada)

| Fase | Acción | Riesgo |
|------|--------|--------|
| **F-A** | Deploy gate en host aislado + tokens + VIEW_SECRET | Bajo |
| **F-B** | CRM `client=http` + reenviar `scan_id` en register_deposit (C1, C2) | Bajo |
| **F-C** | PAM panel: llamar al gate antes de guardar; persistir JPEG limpio + scan_id (P1, P6) | Medio |
| **F-D** | PAM consume `extraction`/`bank`/`validation` del gate y **borra su OCR** (P2, P3, P4) | Medio |
| **F-E** | PAM operador: vista por proxy Bearer (P5) | Bajo |
| **F-F** | Limpieza: quitar gate local del CRM (C3) + dedup/saneo propios del PAM (6.1) | Bajo |
| **F-G** | WhatsApp (C4) + primera_carga por gate (C5) | Bajo |

---

## 10. Checklist de integración

**Gate (este repo)** — rama `main`, repo `MartinLope369/Programa-Comprobantes`:
- [x] `POST /scan` con extracción + banco + view_url
- [x] `GET /scans/:id`, `GET /receipts/:id` (token o Bearer)
- [x] Multi-proveedor IA (Claude→OpenAI→Gemini), testeado con 43 reales
- [x] Docker/prod: tokens, VIEW_SECRET, ClamAV, PUBLIC_URL (G6) — `docker-compose.yml`
- [x] Job limpieza de comprobantes expirados (G4)
- [x] Contrato v1 congelado (§2)
- [ ] Sandbox efímero parsers (G5) — único endurecimiento de prod pendiente

**CRM** — rama `feat/receipt-gate/crm-http-only` (pusheada):
- [x] C1 `client=http` + env
- [x] C2 reenviar `scan_id` (+ extraction/bank/validation) en register_deposit
- [x] C3 eliminar gate local embebido + dedup pHash
- [x] C4 WhatsApp (descarga media Kommo → gate)
- [x] C5 primera_carga por gate

**PAM** — rama `feat/payments/receipt-gate-integracion` (pusheada, `6fa0180`):
- [x] P1 panel/tienda → gate (vía pipeline: escanea el archivo, guarda scan_id + JPEG limpio)
- [x] P2 register_deposit lee del gate por scan_id (paybot + numen + crm/deposits)
- [x] P3 borrar OCR propio (`gemini.ts` eliminado; `receipt-reader.ts` puro)
- [x] P4 fail/baja-confianza → cola operador (`manual_review`)
- [x] P5 vista operador por proxy Bearer (`GET /api/payments/[id]/receipt`)
- [x] P6 fail-closed + cola si el gate cae
- [~] 6.1 dedup SHA-256 propio: **se mantiene** como defensa en profundidad (decisión PAM)

**Infra (pendiente — deploy a test):**
- [ ] E2E conjunto local (gate:4100 + CRM + PAM): 4 caminos, 1 scan por comprobante
- [ ] Deploy gate en host sacrificable + ClamAV + tokens + VIEW_SECRET + PUBLIC_URL
- [ ] CRM/PAM apuntando a la URL del gate con token por cliente
- [ ] DNS/firewall gate ↔ CRM/PAM
