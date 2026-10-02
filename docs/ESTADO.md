# ESTADO — GATE (Programa Comprobantes)

> **Este archivo se sobrescribe.** Guarda sólo lo que es verdad **ahora**: en qué estamos, qué
> falta, qué mensajes salieron y qué está live. No guarda historia — para eso está
> [historial/](historial/).
>
> **Regla dura:** un hecho, un lugar. Si un dato está acá, ningún otro archivo lo repite: lo
> **linkea**. Mismo criterio que PAM (`casinodragon/docs/ESTADO.md`).
>
> Última actualización: **2026-09-24 21:00** (Cuenta DNI sin emisor → `receipt_no_sender`; deploy prod pendiente)

---

## Punto actual

**Desde el 12/08 02:44 UTC PAM opera con plata real (MMM):** una caída nuestra ya no deja esperando
una prueba, le congela la plata a un jugador real.

**El OCR leía el año un año menos y mandaba comprobantes frescos a revisión** (25/08, issue #36, PR #37,
**live sólo en prod**). MP del día leído `2025-08-25` → PAM calculó 8763 h. El año estaba impreso y el
fallo era determinista —5/5 mal con el prompt viejo a `temperature 0`, 5/5 bien con el nuevo—: `fecha`
era el único campo del camino del dinero sin endurecer. El comprobante **verifica su propio año** (imprime
"Martes") y de ahí sale la v1.6; `fecha` sigue saliendo cruda. En [historial/](historial/2026-08.md).

**Aparecido en ese deploy: perdí el SSH a `gate-test`** (G-TEST-SSH) — v1.6 quedó en prod y **no** en test.

**Live y sin novedad:** los dos entornos avisan cuando se caen (push + sondeo de PAM); el agotamiento
de créditos de IA sigue sin disparador acá y **PAM lo tapó desde el síntoma** (#593, ver Deudas).
El primer tráfico real de prod (12/08) y los seis intercambios de ese día están narrados en
[historial/2026-08.md](historial/2026-08.md). **La lección que sobrevive:** una credencial compartida
se verifica desde el lado que **no** la emite, y los `.env` del vault llevan la huella `sha256[:12]`
de cada token para que el consumidor compare sin que ninguna punta mande el valor.

---

## Puntos abiertos

| # | Qué falta | Dueño | Prioridad |
|---|-----------|-------|-----------|
| G-EVAL-RET | **Retención de `/data/ocr-eval`: indefinida y por default.** Medido en prod: **14 JPEG (1012 KB), todos del 27/07**, contra 29 filas de `ocr_feedback`. **Origen corregido: 28 `batch` + 1 `manual`, cero `endpoint`** — PAM nunca llamó a feedback, lo cargué yo importando su corpus, así que la decisión de retener es mía y no de un consumidor. Dato que decide: **los 29 scans ya expiraron de la BD**, o sea que quedan imágenes con CBU y nombre reales que ni siquiera se pueden atribuir. Lo que enseña son los pares (24/29 exactos, 4 glyph, 1 length) y esos no necesitan la imagen → TTL a la imagen, pares indefinidos. PAM lo lleva a la mesa con el dueño. | **GATE** decide · PAM lleva | Media |
| G-FECHA-CONSUMO | **Dos campos de fecha en el cable que nadie lee.** (a) `receipt_age_hours`: no aparece en el `src` de PAM y su interfaz `GateScanAccepted` no lo declara, así que su regla de 48 h sigue midiendo con `hoursAgo(fecha)` = `new Date()` sin offset y **su ventana efectiva sigue siendo 45 h**. (b) `fecha_anio_sospechoso` (v1.6, #36): hasta que PAM lo consuma, un año mal leído le sigue llegando como `COMPROBANTE_VIEJO` — la diferencia es que ahora queda visible en vez de silencioso. Los dos errores apuntan al lado seguro (revisión, nunca acreditar de más), así que no es urgente; pero un campo no cierra nada por estar en el cable. | **PAM** consume | Media |
| **G-CVU-CEROS** | **El OCR cuenta mal las corridas de ceros de un CBU/CVU.** Corpus limpio de PAM (13/08): **18 variantes / 41 ocurrencias / 7 emisores / 30,1%** sobre su CVU (el 63/19/11/37% anterior estaba inflado con transferencias a otra cuenta y fallos de extracción). Todas las variantes difieren en corridas de ceros, nunca en el `888` ni en el `9679`. Contraejemplo: `0000155300000000009885` (dos corridas, una de 10) se leyó 7/7 idéntico en 4 emisores — no es riel de PAM, inferencia por convergencia. Pista: importa **cuántas** corridas hay, no cuán larga es la más larga. CSV en `scripts/ocr-corpus/corpus-cvu-pam-20260813.csv`. | **GATE** | Media |
| G-OCR-IMPORT | **El importador del corpus no acepta cuentas, y eso traba el A/B.** `ocr-eval:import` sólo admite `codigo_operacion \| coelsa_id` y exige `scan_id`; el CSV de PAM trae 41 filas sin scan_id → ampliar `FeedbackField` y aceptar filas sin scan. Destraba el **A/B few-shot Fase 2** (minado PAM n=1, #459), que ya tiene **41 casos propios** de `G-CVU-CEROS`. | **GATE** | Media |
| **G-DEDUP-VENTANA** | **La señal `duplicate_global` sólo mira 7 días, y con el segundo portal de PAM pasa a ser su única defensa.** Resuelve contra `scan_records`, que se purga a las 168 h: medido en prod, **0 filas más viejas que 7 días**. `phash_comprobante` —que ya guarda `sha256` + `subject_id` **para siempre** (62 filas, 31 fuera de esa ventana)— tiene todo lo que el camino sha256-exacto necesita y no se consulta. **Arreglo propuesto a PAM:** que el sha256 global consulte también esa tabla, con lo que el horizonte del reuso literal deja de ser 7 días sin retener ni un dato nuevo. Limitación a decir: esas filas no tienen `scan_id`, así que el match viejo daría `first_scan_id:null` (su código cae al `cross_user===true`, que igual rechaza). Da propósito a G-PHASH-RET. **No se toca sin OK de PAM:** es el camino del dinero. | **GATE** propone · **PAM** decide | **Alta** |
| **G-TEST-SSH** | **SSH a `gate-test` caído** (`:22` timeout; host vivo — nginx :80 OK). No deploy test; v1.6 sólo prod. Mismo SG que allowlist `:443`: abrir `:22` e IP QA juntos (CRED 28/08). | **GATE** (AWS) | **Alta** |
| G5 · G8 | Sandbox poppler/sharp (F4) · PDF multipágina (evaluar). | **GATE** | Alta / Baja |
| **G-CUENTA-DNI-SENDER** | **`receipt_no_sender`** (Cuenta DNI post-éxito sin emisor) en código local + contrato; **prod** tras PR+deploy. Causa ops: heurística preview `sin fecha/código + sin emisor`. | **GATE** | **Alta** |
Cerrados (**G-TRAZA-C12** allowlist+deploy 15/09, etc.): [historial/](historial/).

---

## PRs abiertos

> Se lista acá porque el 28/07 un PR con un fix estuvo **parado 10 días** sin que ningún archivo de
> estado lo dijera. Si no hay, dice "ninguno".

Ninguno. **#37 (año de `fecha`, issue #36) mergeado el 25/08**; **#21 a #24, #26, #27, #29 y #31**
entre el 12/08 19:00 y el 13/08 07:15, y **#33 (13/08 17:39) y #35 (14/08 00:45)** — gate verde en cada uno. `main` = lo que corre en los dos
hosts, verificado archivo por archivo.

> **El remoto no dice lo que corre.** `origin/main` estuvo 9 commits atrás de prod dos veces (28/07 y
> 12/08). Antes de deployar: `git log --oneline origin/main..main` y comparar el `src` del host contra
> el remoto **ignorando el CR** (el 12/08 diferían diez archivos y siete eran sólo fin de línea).

---

## Outbox de mensajes — **única fuente de verdad sobre si un mensaje salió**

> Ningún otro archivo puede afirmar que un mensaje se envió o no. La narrativa linkea acá.
> Estados: `BORRADOR` · `ENVIADO` · `RESPONDIDO` · `DESCARTADO`.

| REF | De → A | Estado | Nota |
|-----|--------|--------|------|
| `MSG-GATE-20260825-1` | GATE → PAM · CRM | **ENVIADO** (26/08 00:05) | v1.6 del contrato (#36): `dia_semana`, `fecha_anio_sospechoso`, `fecha_alternativa`. Aditivo, `fecha` intacta. Incluye que su `COMPROBANTE_VIEJO` era una entrada falsa y no su regla, y la corrección del diagnóstico de gate-test (no hay outage: es mi `:22`). Espera respuesta a dos puntos: que los campos nuevos no le rompan el parseo, y si alcanza gate-test por 443 — es el único que tiene ese puerto. |
| `MSG-CRED-20260828-3`·`-9`·`-5` ↔ `MSG-GATE-20260828-1`·`-2` | CRED ↔ GATE | **CERRADO** · `-2`, `-3` y `-4` **ENVIADOS** (28/08) | Pedían Bearer QA para CROSS-G01; **no se emitió y CRED cerró el pedido**. El bloqueo no era el token: **el `:443` no atiende fuera de la allowlist**, medido desde **dos puntos independientes** —el mío y el host de la suite de QA (mismo `3.12.87.253`, `TcpTestSucceeded: NO`, `curl` HTTP 000)—, así que con Bearer o sin él el smoke da **timeout, no 401**. `GATE_BEARER` queda **vacío a propósito**. **El `-5` llegó después del `-9`** y pide esperar la medición que el `-9` ya trajo: avisado, porque si en su registro figura esperando respuesta las dos tablas dicen cosas distintas (pasó el 28/07 con PAM). Sigue vivo sólo lo de a/b/c, que contesta el `-2`: **`gate-test:443` tampoco atiende**, así que mudar (c) a test necesita **tres** cosas y su plan lista dos —falta la IP de QA en la allowlist, mismo security group que el `:22`—; sin objeción a (b) como smoke P0, sí a reetiquetar el caso 400, porque por el CRM **no se alcanzan los rechazos de borde** (`too_small`/`bad_type` salen en Capa 1, antes de ClamAV y de la IA) y un verde podría ser del CRM y no del gate. Ofrecido: confirmar desde `scan_outcome` si una corrida (b) tocó el gate (**ventana de 7 días**, el TTL de la traza). **CRED desdobla** (`-10`, decisión compartida): el 400 queda como (b) y el contrato de `/scan` va a un caso nuevo bloqueado, así que el verde no tapa el hueco. El `-3` sólo pide que ese caso diga **"contra entorno desplegado"**: el contrato **sí** se prueba hoy en cada gate de calidad (`smoke.mjs` local, sin credencial), y lo que falta es el artefacto desplegado — que es donde está el precedente real (13/08, un deploy apagó dos flags de contrato en test). **`-14`/`-4`: umbral de `too_small` medido en el contenedor de prod** = **3072 exactos** (3071 → `too_small`, 3072 → `bad_type`), igual al corte del CRM, así que la franja es **vacía** y `too_small` queda sombreado. Pero **el umbral sí es verificable por la costura**: el par "CRM corta en 3071 · GATE contesta `bad_type` en 3072" encierra el borde sin token nuevo — **si** el CRM no valida mime, que es lo único que sigue abierto. De paso medido el otro borde y su trampa (`too_large` sólo entre 10 MB + 1 y ~10,7 MB; arriba contesta 413 de Express sin que E1 corra) y documentado en el contrato, donde el mínimo faltaba. Las 13 sondas **no escribieron nada** en prod: el archivo más nuevo de `/data/receipts` es 17 h anterior. |
| `MSG-PAM-20260904-107` ↔ `MSG-GATE-20260905-1` | PAM ↔ GATE | **ENVIADO** (05/09) | Abren **segundo portal** (El Rey Bet, 0 jugadores) y su dedup lleva `store_id` en la PK, así que el mío pasa a ser la única defensa contra el mismo comprobante usado en los dos. **Su frase "SHA-256 y global en Gate" describe la SEÑAL y se leería como RECHAZO — y eso es falso.** Demostrado en vivo con un comprobante real: mismo sujeto → `rejected:duplicate`; **otro sujeto → `accepted`** con `duplicate_global{via:sha256, cross_user:true, first_scan_id}`. GATE **no bloquea**: entrega el flag y PAM decide. Y el límite que importa, medido en prod: la señal global resuelve contra `scan_records`, que se purga a las **168 h**, así que su horizonte es **7 días** (0 filas más viejas), mientras `phash_comprobante` guarda para siempre (62 filas, 31 ya fuera de esa ventana). Rate-limit es **por `subject_id`, no por token**: los dos portales no comparten cubeta y nada cambia; lo que sí comparten es la **key de IA**. |
| `MSG-GATE-20260826-1` | GATE → PAM · CRM | **ENVIADO** (28/08) | Contesta el `-26` (puntos 1 y 3) y **reemplaza al `MSG-GATE-20260813-3`, que quedó `DESCARTADO` sin salir: doce días en borrador**. El arreglo (#33 y #35) se desplegó a tiempo; el aviso no, y **el sensor `#619` de PAM quedó con `FORMA_AVISA=false` esperando esa confirmación**. Va remedido en el contenedor vivo (10/10) y con **3 anulaciones en 2 de 8 scans** (19–26/08) para que PAM compare contra su propio sensor en vez de mi palabra. **CRM nunca había sido avisado del `null`** y era el motivo por el que PAM pidió el arreglo acá. **Falta el acuse:** esto se audita contra el destinatario, así que recién cierra cuando PAM o CRM citen el REF — no cuando lo diga esta tabla. |
| `MSG-PAM-20260813-26` ↔ `-2` | PAM ↔ GATE | **RESPONDIDO** | OK para prod. 77/135 no eran cero: 18 misreads + 59 otro campo. Corpus limpio 41/18/7. Contraejemplo 7/7 en 4 emisores. |
| TRAZA feed/deploy (08–10/09) | TRAZA ↔ GATE | **CERRADO** | #54 live; acuses `-6`/`-2`. `12_TRAZA_FEED.md`. |
| `MSG-TRAZA-20260915-1`·`-3` ↔ `MSG-GATE-20260915-1`·`-3` | TRAZA ↔ GATE | **ENVIADO** (15/09) | **`-1`:** allowlist OK (TRAZA). **`-3`:** 404+401 = **código viejo (sin `/traza/v1/feed`) + token `traza` ausente en prod `.env`**. Deploy **16:11 UTC** (#54 en host + `traza` sha12 `3ad85f5637b9` + scopes). Medido en host: `/health`·`/stats`·`/traza/v1/feed?limit=1` → **200 JSON**. Cierre: re-medición desde control-traza. |
| `MSG-QA-CRED-20260924-15` ↔ `MSG-GATE-20260924-1` | CRED(QA) ↔ GATE · CC CRM/PAM | **ENVIADO** (24/09) | Cuenta DNI éxito sin emisor: reason **`receipt_no_sender`** (case-insensitive). Preview real sin cambio. ETA prod **2026-09-26** post-PR+deploy. Contrato `05_INTEGRACION` + `npm run test:states`. |
| 12/08 y antes · `MSG-QA-QASE-20260825-GATE-36` | — | **CERRADOS** | **#36:** comentado listo-retest; la CVU **no** estaba OK y el flag ya lo decía. **Los seis pares del 12/08** (`-7`↔`-15` · `-5`↔`-11` · `-4`↔`-9` · `-3`↔`-8` · `-2`↔`-6` · `-1`↔`-4`): las 5 preguntas al salir a plata real, el wipe con corte `03:00:00Z`, el outage de tokens de gate-test, el token fantasma, la zona de `fecha`, el endpoint de alertas y la primera sonda de dev. **29/07 y antes:** `MSG-PAM-20260729-5`/`-1` (G-CBU), la serie del checksum v1.2 y todo el 27/07. Narrados en [historial/](historial/). Dos colas viejas: **PAM no tiene `MSG-PAM-20260727-6` en su registro** y falta el acuse del `MSG-CRM-20260717-1` (allowlist de Aston). |

---

## Qué está live

| Pieza | Estado |
|-------|--------|
| Gate **prod** (`gate.megamooneymaker.com` · `3.12.87.253`) | UP · ClamAV OK · watchdog 5 min + swap 2G · `gate-health-monitor.service` **con push a PAM** · **3 tokens**: `crm`, `pam`, `traza` (huellas en vault) · atendiendo tráfico real desde 12/08 15:23 |
| Gate **test** (`gate-test.megamooneymaker.com` · `18.225.198.243`) | **Prendido y sirviendo** (nginx contesta) pero **sin SSH** (G-TEST-SSH) → no se puede deployar · `clamav.ok:true` al 13/08 · **3 tokens**: `crm` `5371bea4d2f9`, `pam_test` `09e3104ad110`, `pam_dev` `e7d920ced329` · atiende PAM test **y** PAM dev |
| Aislamiento prod ↔ test | Verificado 12/08: EC2, volumen Docker, base SQLite, almacén y tokens distintos. Un token de test no abre prod. |
| Atribución + scopes por token | **LIVE prod** (10/09). Etiqueta → `scan_outcome.client`. `RECEIPT_GATE_SCOPES` acota rutas (`traza=traza:feed,stats`); sin entrada → **COMPLETO** (CRM/PAM). Ver `12_TRAZA_FEED.md` § 6. |
| `GET /traza/v1/feed` (Control / TRAZA) | **LIVE prod** (deploy verificado **15/09 16:11 UTC** en contenedor; antes doc≠host). Token `traza` + scopes; C12 allowlist `98.94.126.23`. **No** gate-test (G-TEST-SSH). |
| `subject_id` en las 5 salidas de `scan_outcome` | **LIVE prod + test** (12/08, PR #24). Antes un **rechazo no dejaba rastro del sujeto** —no persiste fila y el log sólo traía la etiqueta del token—, y el rate-limit se cobra por `subject_id` **antes** del forense: un sujeto podía quedar frenado por rechazos que no estaban en ninguna parte. |
| Traza de log que sobrevive al deploy | **LIVE prod + test** (13/08, PR #26). El log iba sólo a stdout, que **se borra al reemplazar el contenedor**: el deploy de las 21:44 se llevó la evidencia del scan de las 21:23. Ahora va también a `/data/logs`, un archivo por día UTC. **Retención 7 días = el TTL de los scans que describe** (decisión escrita, no default). |
| Flags sensibles al dinero por `.env` | **LIVE prod + test** (13/08 04:25, PR #27). `RECEIPT_DEDUP_CONTENT_STRONG` y `RECEIPT_SANITIZE_INVALID_CBU` vivían sólo en el `docker-compose.yml` de cada host, que el deploy sí sincroniza: el 13/08 04:18 un deploy los apagó en gate-test. Ahora pasan por el `--env-file`, con el valor en el `.env` del host (que ningún deploy toca) y reflejado en el vault. |
| Huellas de tokens en el vault | `sha256[:12]` de cada token en `GATE/prod.env` y `GATE/test.env`, para que el consumidor verifique sin que nadie mande el valor. |
| Aviso saliente de caída | **LIVE prod + test** (12/08) · `monitor-gate-health.sh` empuja a `POST /api/internal/gate-alert` de PAM: 2 muestras malas seguidas, `checkedAt:null` = arrancando, recuperación siempre avisada y con el nombre del evento que se cayó. Config en `.gate-alert.env` (chmod 600, fuera de la unit de systemd). El camino de alarma se **ensayó desde el host de prod contra el buzón de test**, para no dejarle un crítico falso al operador de una tienda con plata real. |
| Año de `fecha` verificado contra el día impreso (v1.6) | **LIVE sólo en prod** (25/08 02:24 UTC, `6f5ff0f`, PR #37, issue #36) — **falta gate-test**, donde no hay SSH para deployar (G-TEST-SSH). Verificado en el bundle que corre: 6/6 dentro del contenedor, y la imagen real de #36 releída 3/3 con el año bien (0,82 h de edad donde daba 8763). Prompt endurecido en los **tres** proveedores (Claude/OpenAI/Gemini) + `dia_semana` transcripto + cruce con el calendario. `fecha` **nunca** se reescribe: la candidata va en `fecha_alternativa`. **No** se marca "parece de hace un año" por reloj propio — sin evidencia en la imagen, esa señal sólo empuja hacia acreditar. `npm run test:fecha-sanity` (47 casos) · `npm run exp:fecha-anio` (la medición 5/5, cuesta IA). |
| `receipt_age_hours` en `/scan` y `/scans/:id` | **LIVE prod + test** (12/08 19:03). Aditivo. Interpreta `fecha` en **UTC-3** explícito y mide contra el reloj del GATE; `null` si no es parseable, negativo si la fecha es futura. `npm run test:receipt-age` corre en TZ=UTC y TZ=ART con el mismo resultado. Verificado en prod sobre 3 comprobantes reales (3,71 · 3,03 · 3,05 h). Seguro de agregar porque el cliente de PAM hace un `as` sin validación en runtime (`receipt-gate.ts:207`) — **verificado en su código, no asumido**. |
| Wipe con corte por fecha (`--before <ISO>`) | **LIVE**. Preferir sobre `--full` en prod: entre el preview y el borrado puede entrar un scan real. No toca `/data/ocr-eval`. |
| Integración CRM → GATE → PAM | Cerrada punta a punta desde 02/07 (`dep_146`) |
| Dedupe global por contenido (#402) | **LIVE en prod** con la condición de hora real que pidió PAM · `coelsa_id` exacto incondicional |
| `code-sanity` (anula basura sin reescribir) | LIVE prod+test · guard de UUID para LEMON/Ualá · **cuenta en `null` cuando no hay cuenta** (#35, 14/08): el saneo corre **antes** del flag (`receipt-reader.ts:268` → `:284`), así `null`+`null` = "no encontré la cuenta" y `dígitos`+`false` = "la leí mal"; un CBU roto **se preserva**. Re-verificado en el contenedor de prod el 26/08: 10/10, y **3 anulaciones reales en 2 de 8 scans** (19–26/08). **Deuda:** un comodín en `isBankNameLike` corre antes de la regla de persona y etiqueta `bank_name` a nombres cortos ("Victor Trimboli"). El campo se anula igual y la etiqueta **no** viaja en el contrato — sólo ensucia un desglose por categoría. |
| Base que aprende del OCR (Fase 1) | LIVE · `POST /scans/:id/feedback` · `npm run ocr-eval:report` |
| Normalización post-OCR de CBU/CVU (DolarApp/ARQ) | LIVE desde PR #14 (05/07) |
| Checksum CBU/CVU v1.2 (aditivo, NO anula) | **LIVE prod+test** · **PAM lo consume en prod desde 29/07 (solo emisora)** |
| Few-shot Fase 2 (A/B) | En espera — ver G-OCR |

---

## Deudas y riesgos anotados

- **`fecha` sale como está impresa** (hora argentina, sin sufijo) y así quedó el contrato: quien la
  parsee en un proceso UTC la lee 3 h más vieja. **Confirmado con datos reales, no leyendo el código:**
  los 3 comprobantes de prod dan `fecha` 1–3 min antes de su `created_at` al pasar de ART a UTC.
  `receipt_age_hours` existe para no depender de esto (G-FECHA-CONSUMO).
- **Créditos de Anthropic: el agujero que el push NO tapa.** Los transitorios están cubiertos
  (`ai-retry.ts`, 529). Si los créditos se **agotan**, cada `/scan` cae en `failed:forensic` y `/health`
  sigue diciendo `ok:true` + `ai_configured:true` — mide que la key **esté**, no que **funcione**. Ni mi
  push ni el sondeo de PAM lo ven; PAM lo tapó desde el síntoma y reservó `ai_credits_exhausted` para
  cuando lo cablee. En gate-test los créditos los queman PAM test y PAM dev de la **misma key**.
- **Un token no se puede acotar a una ruta.** `requireAuth` acepta cualquier entrada de la allowlist en
  las cinco rutas protegidas; la etiqueta sólo viaja al log. Por eso el 28/08 **no** se emitió el Bearer
  "solo QA/scan" de CRED: en prod habría podido leer el comprobante de un jugador real (no enumerable
  —`/stats` no da ids—, pero los `scan_id` circulan en tickets y logs). El alcance va **antes** de emitir.
- **`MAX_RECEIPT_AGE_HOURS = 48` no rige nada**: `isReceiptTooOld()` sigue sin llamadores. Se deja
  porque documenta la paridad con PAM, pero se lee como regla activa.
- **Un deploy sobrescribe estado hecho a mano, y no avisa.** Dos deploys seguidos, dos pérdidas
  silenciosas (el log del contenedor y los flags del compose), las dos descubiertas de casualidad. Lo
  que no esté en el repo o en un archivo que el deploy no escriba (`.env`, `/data`) se pierde: el
  script imprime el diff y **no frena con él**. Los `.sh` empaquetados desde Windows salen con CRLF
  (`.gitattributes` normaliza el commit, no el tarball); el instalador del monitor se cura solo.
- **`phash_comprobante` acota la lectura y no purga nunca.** `phashTtlDays: 30` limita la consulta;
  no hay `expires_at` ni purga (sólo el wipe manual). **Desde el 11/09** quedan filas inalcanzables y
  no borrables; hoy **0** (15 filas, la más vieja del 12/08, ~1/día, `subject_id`+hash sin imagen).
  `duplicate_global` **no** está afectado: resuelve contra `scan_records` dentro de la ventana, así que
  su `first_scan_id` siempre apunta a un scan vivo — verificado el 26/08, no supuesto.
- **Cuatro llaves privadas con una sola copia** en el host EC2 de PAM (`~/.ssh/`), en `INVENTARIO.md`.
- **No correr** `migrate-cutover.sh` ni `configure-senderio-etapa2.sh` ni smokes de gate-test contra
  CRM prod durante UAT.

---

## Dónde se escribe cada cosa

La tabla de ruteo vive en `.cursor/rules/docs-routing.mdc` (regla siempre activa) y **no se copia acá**:
duplicarla es la forma más rápida de que las dos digan cosas distintas. Este archivo es el de la
primera fila — estado actual, pendientes, mensajes, qué está live — y se sobrescribe libre.
