# 12 · `GET /traza/v1/feed` — feed de trazabilidad

Contrato con la instancia **TRAZA / Control** (`MSG-TRAZA-20260908-3`). Cierra el hueco entre
`GET /stats` (contadores en memoria, sin ids) y `GET /scans/:id` (hay que saber el id de antemano):
faltaba **enumerar** los scans de un período.

---

## 1. Lo que este feed NO puede darte

Va primero porque es lo que decide si sirve para lo que lo quieren usar. Ninguna de las tres es una
limitación de la query: son propiedades del gate.

### 1.1 Sólo hay comprobantes ACEPTADOS

`scan_records` se escribe en **un solo lugar**: la rama aceptada de `processScan`. Un rechazo
(`too_small`, `bad_type`, `duplicate`, `not_a_receipt`, `infected`, `rate_limited`…) **no deja
fila**. No están filtrados del feed — nunca se escribieron.

Consecuencia: `payload.veredicto` es **constante** (`"accepted"`) y **el feed no sirve para auditar
rechazos**. Los rechazos existen sólo:

- agregados y sin ids, en el ítem `gate.stats` (y en `GET /stats`);
- en la traza de disco (`scan_outcome`), que no se expone por HTTP y vive 7 días.

Quien construya una vista de cumplimiento sobre este feed y no lea esto va a mostrar una operación
sin un solo rechazo, que es exactamente lo contrario de lo que pasó.

### 1.2 El horizonte es la retención, no el `since`

Las filas se purgan en `expires_at = created_at + RECEIPT_VIEW_TTL_HOURS` (**168 h** = 7 días; es el
default del código y en prod **no** está seteada la variable, así que corre con ese valor). El job de
limpieza pasa cada `RECEIPT_CLEANUP_INTERVAL_MIN` (60 min).

Un `since` anterior a ese piso devuelve **vacío por purga**, no por inactividad. Para que eso no se
lea mal, la respuesta trae `retencion.desde_utc`: **todo pedido por debajo de ese instante es
irrecuperable acá**. Si Control quiere histórico más largo, tiene que **persistirlo del lado suyo**
haciendo pull dentro de la ventana; el gate no es el archivo.

### 1.3 `duplicate` en el feed es sólo `sha256`

La señal completa (`duplicate_global`: sha256 **o** pHash cercano + contenido corroborado) recorre la
ventana entera por ítem y parsea la extracción de cada candidato. En una página de 500 eso es del
orden de 500×N parseos de JSON, o sea que el feed se caería solo cuando crezca el volumen.

Así que acá va la versión barata, por el índice `idx_scan_sha256` (O(1) por ítem) y **declarada** en
`payload.duplicate.alcance = "sha256_exacto"`. La señal completa sigue en `GET /scans/:id`.

---

## 2. Request

```
GET /traza/v1/feed?since=<ISO-8601>&cursor=<opaco>&types=<csv>&limit=<n>
Authorization: Bearer <token con scope traza:feed>
```

| Parámetro | Default | Notas |
|---|---|---|
| `since` | sin filtro | ISO-8601. Inválido → **400** `bad_since`. Acotado por `retencion` (§1.2) |
| `cursor` | — | Opaco. El de la respuesta anterior. Ilegible → se ignora (200, desde el principio) |
| `types` | los dos | CSV de `gate.scan`, `gate.stats`. Desconocido → **400** `bad_types` |
| `limit` | 100 | Tope **500**; por encima se recorta sin error. `< 1` o no numérico → **400** `bad_limit` |

## 3. Respuesta

```jsonc
{
  "program": "gate",
  "generatedAt": "2026-09-08T23:10:00.000Z",
  "cursor": "MjAyNi0wOS0wOFQxMjowMDowMC4wMDBafGFiYy0xMjM",  // null si no hubo ítems
  "hasMore": false,
  "items": [ /* ver abajo */ ],

  // ADITIVO (no estaba en el pedido). Si no lo usan, ignórenlo — pero léanlo una vez.
  "retencion": { "horas": 168, "desde_utc": "...", "nota": "..." }
}
```

### `gate.scan`

`id` estable: `gate.scan:<scan_id>`. `ts` = `created_at`.

```jsonc
{
  "type": "gate.scan",
  "id": "gate.scan:26a2a98a-...",
  "ts": "2026-09-08T12:00:00.000Z",
  "telefono": "+5491112345678",      // E.164 o null — ver §4
  "payload": {
    "scan_id": "26a2a98a-...",
    "veredicto": "accepted",          // CONSTANTE (§1.1)
    "subject_id": "prod:store_235",
    "channel": "pam_store",
    "phash": "7c2c695d7d587d78",
    "sha256": "e98ccd18...",
    "bank": { "canonical": "Brubank", "kind": "banco", "known": true },
    "extraction": { /* misma forma que /scan y /scans/:id */ },
    "validation": { "is_valid": true, "alerts": [] },
    "receipt_age_hours": 6.42,
    "duplicate": { "alcance": "sha256_exacto", "seen": false, "count": 0,
                   "cross_user": false, "first_scan_id": null, "nota": "..." },
    "forensic_status": "ok",
    "created_at": "...", "expires_at": "..."
  }
}
```

### `gate.stats`

Uno solo, **sólo en la primera página** (repetirlo por página lo haría contar de más al sumar).
Si la ventana no tiene un solo evento, el ítem **se omite** (como pidieron).

```jsonc
{
  "type": "gate.stats", "id": "gate.stats:1440m", "ts": "<generatedAt>", "telefono": null,
  "payload": {
    "ventana_min": 1440, "aceptados": 12, "rechazados": 3,
    "rechazados_por_reason": { "too_small": 2, "not_a_receipt": 1 },
    "fallas": 0, "fallas_por_step": {},

    // Declarado a pedido (acción 3): cambia cómo se lee un cero.
    "persistencia": "memoria", "reinicia_con_el_proceso": true, "acumulable": false
  }
}
```

**`/stats` sigue siendo sólo memoria.** Ventana deslizante en el proceso, tope de 50.000 eventos,
sin ids y sin histórico: no se puede sumar entre pulls ni reconstruir hacia atrás, y un restart del
contenedor lo deja en cero.

## 4. `telefono`

El contrato pide **E.164 o `null`**. En la base hay un tercer valor que no es ninguno de los dos:
**cadena vacía** — `phone` es opcional en `POST /scan` y algunos clientes mandan `""`. Se normaliza
a `null`.

No adivinamos código de país: un número sin `+` no se "arregla" prefijando algo, porque prefijar mal
**inventa el teléfono de otra persona**. Lo que no es E.164 verificable sale `null`.

Medido en prod el 08/09: de 30 scans, 14 con `phone` no nulo, y de esos **la mayoría son `""`**.
O sea que hoy la mayoría de los ítems van a traer `telefono: null`, y no es un bug del feed.

## 5. Paginación

Orden total **`(created_at, id)`**. `created_at` solo no alcanza como cursor: dos scans del mismo
milisegundo se saltean o se repiten para siempre. El cursor es opaco (base64url de `created_at|id`);
no lo parseen.

```
GET /traza/v1/feed?since=...&limit=200     → cursor: "X", hasMore: true
GET /traza/v1/feed?since=...&limit=200&cursor=X → siguiente página
```

Cortar cuando `hasMore` es `false`. Cursor ilegible → se ignora (200 desde el principio), nunca 500.

## 6. Auth: scopes por token

Hasta el 08/09 `requireAuth` sólo miraba que el token **existiera**: cualquier credencial podía todo.
Por eso el 28/08 no se le emitió token a QA (`MSG-GATE-20260828-2`) — no se entrega una credencial
cuyo alcance la implementación no puede hacer cumplir. Esto es lo que faltaba.

`RECEIPT_GATE_SCOPES` mapea **etiqueta de token → scopes**: `etiqueta=scope[,scope];otra=scope`.

| Scope | Rutas |
|---|---|
| `scan` | `POST /scan` |
| `read` | `GET /scans/:id`, `GET /receipts/:id` |
| `stats` | `GET /stats` |
| `feedback` | `POST /scans/:id/feedback` |
| `traza:feed` | `GET /traza/v1/feed` |

El token de TRAZA es `traza=traza:feed,stats`. Verificado sobre HTTP: `POST /scan` **403**,
`GET /scans/:id` **403**, `GET /receipts/:id` **403**. El 403 dice `required_scope`.

> ⚠️ **El default es permisivo.** Una etiqueta **sin** entrada en `RECEIPT_GATE_SCOPES` queda con
> acceso **COMPLETO**. Es a propósito —así el deploy no voltea los tokens vivos de CRM y PAM— pero
> significa que **un token nuevo al que se le olvide el scope puede todo**. El arranque loguea
> `GATE: alcance de cada token` y, en production, un `warn` por cada token full. Si alguna vez se
> invierte el default, es un cambio que rompe y va con aviso R1.

## 7. Red

**La allowlist sigue siendo obligatoria.** El `:443` de prod no atiende fuera de ella, así que el
pull lo hace Control (o un worker con red), **nunca el browser**, y el feed **no se abre a internet**.

Ojo con el modo de falla, que ya costó un día en otro hilo: si la IP del que hace pull **no** está en
el security group, lo que se ve es **timeout, no 401**. Un 401 significa "llegaste y el token está
mal"; un timeout significa "no llegaste". GATE **no es dueño** de esa allowlist.

## 8. Exposición

Este endpoint cambia el modelo de exposición y conviene decirlo: antes, para leer un comprobante
había que **conocer** su `scan_id`. Ahora se pueden **enumerar todos** los del período, con
extracción (montos, CBU/CVU, nombres) y teléfono. Eso es justamente lo que pidieron, y es la razón
de que tenga scope propio, allowlist obligatoria y que el JPEG **no** viaje en el feed (para la
imagen hace falta `read`, que el token de TRAZA no tiene).
