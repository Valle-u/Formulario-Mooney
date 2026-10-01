# Auditoría técnica — Sistema de Egresos Mooney Maker

Fecha: 2026-10-01 · Alcance: repositorio completo (backend Express + PostgreSQL, frontend vanilla JS, migraciones, scripts, documentación).

Todo lo que figura como "verificado" se reprodujo levantando la aplicación contra un PostgreSQL 16 local, con datos de prueba, y en algunos casos en un navegador real.

---

## 1. Resumen

| Severidad | Hallazgos | Corregidos en esta auditoría |
|-----------|-----------|------------------------------|
| Crítica   | 4 | 4 |
| Alta      | 5 | 5 |
| Media     | 8 | 4 |
| Baja / deuda técnica | 9 | 1 |

Los dos hallazgos más graves son que **cuatro endpoints que ejecutan DDL estaban abiertos sin autenticación** (uno de ellos accesible por GET, capaz de romper el alta de egresos para 9 de las 17 empresas activas) y un **XSS almacenado** que permitía a un empleado ejecutar código en el navegador de un admin.

Además se encontraron tres funcionalidades que **nunca funcionaron** desde que se escribieron: las notificaciones en tiempo real, la validación de archivos por contenido y la descarga de comprobantes guardados en disco local.

---

## 2. Críticos

### C-1. Endpoints de mantenimiento sin autenticación (corregido)

`/api/run-migrations`, `/api/check-migrations`, `/api/init-admin` y `/api/fix-id-transferencia` no tenían ningún middleware de autenticación.

**Impacto verificado.** Un `GET` anónimo a `/api/run-migrations` reinstala un `CHECK` obsoleto sobre `egresos.empresa_salida` que solo acepta 8 valores (`Telepagos`, `Copter`, `Palta`, `Personal Pay`, `Lemoncash`, `NaranjaX`, `TrustWallet`, `Mercado Pago`). Las 17 empresas activas incluyen además Brubank, Binance, AstroPay, DolarApp, Uala, Cuenta DNI, Lohas, Banco Nacion y "Otra". Después de ese GET, el alta de un egreso con cualquiera de esas 9 empresas falla con `Datos inválidos: revisá TURNO/ID/MONTO`:

```
GET /api/run-migrations  -> HTTP 200
POST /api/egresos (empresa_salida=Brubank) -> {"message":"Datos inválidos: revisá TURNO/ID/MONTO"}
```

Siendo un `GET` sin efectos declarados, lo puede disparar un crawler, un escáner de seguridad o el prefetch del navegador. El mensaje de error no menciona la empresa, así que el diagnóstico desde la operación es muy difícil.

`/api/init-admin` crea un usuario `admin` con contraseña fija y **la devuelve en el body**. Verificado contra la base limpia:

```
POST /api/init-admin -> {"success":true,...,"credentials":{"username":"admin","password":"MooneyAdmin2025!"}}
```

El único freno era "si ya existe un admin, no hacer nada": si por una migración, un borrado o un cambio de rol la tabla queda sin ningún `role='admin'`, cualquiera en internet se hace administrador.

**Corrección.** Los endpoints se conservan pero quedan detrás de `ENABLE_MAINTENANCE_ENDPOINTS` (apagada por defecto, responden 404) y, salvo el bootstrap del primer admin, exigen admin autenticado. `backend/src/routes/run-migrations-web.js` se eliminó: no estaba montado en `server.js` y traía la misma DDL con una lista de empresas todavía más vieja (6 valores).

**Pendiente recomendado.** Borrar `run-migrations.js`, `check-migrations.js` y los dos handlers de `init.js`. Son parches de incidentes de 2025 ya resueltos por las migraciones 014–031; mantener DDL hardcodeada en rutas HTTP garantiza que vuelva a divergir del esquema real.

### C-2. XSS almacenado de empleado a admin (corregido)

`renderEgresos` (`app-historial.js`) y la tabla de audit logs (`app-logs.js`) armaban HTML interpolando los campos tal como llegan de la API, sin `escapeHtml()`.

Un empleado podía guardar un egreso con `<img src=x onerror="...">` en `usuario_casino`, `cuenta_receptora` o `notas`. El payload se ejecutaba en el navegador de cualquier admin que abriera Consulta Egresos o Logs. Como el JWT vive en `localStorage` y la CSP permitía `script-src 'unsafe-inline'`, el payload podía leer el token del admin y usar la API con sus permisos: alta, edición, borrado de egresos y gestión de usuarios.

**Corrección.** Todos los campos pasan por `escapeHtml()`. Verificado en navegador: con un egreso que guarda `<img src=x onerror="window.__xss=1">`, `window.__xss` queda `undefined` en la tabla y en el modal, y el payload se muestra como texto literal.

### C-3. Las notificaciones en tiempo real nunca llegaron al navegador (corregido)

`notifications.js` escribía `res.write(":ok\\n\\n")`. En JavaScript `"\\n"` es una barra invertida seguida de `n`, no un salto de línea, así que ningún frame SSE terminaba y `EventSource` no despachaba `onmessage` jamás. Verificado sobre el stream crudo (`cat -A`, sin ningún `$` de fin de línea):

```
:ok\n\ndata: {"type":"connected",...}\n\n
```

La campanita de notificaciones no mostró nada desde que se implementó. Tampoco había heartbeat, así que cualquier proxy cortaba la conexión por inactividad y el cliente entraba en el bucle de reconexión cada 5 s de `onerror`.

**Corrección.** Saltos de línea reales y heartbeat de 25 s. Verificado punta a punta: un egreso creado por un empleado llega como evento `egreso_created` al admin conectado al stream.

### C-4. La validación de archivos por contenido no se ejecutaba (corregido)

`fileValidator.js` hacía `const { fileTypeFromFile } = fileTypePkg`, pero `file-type@16` exporta `fromFile` / `fromBuffer` (los nombres `fileTypeFrom*` son de v17+). La constante quedaba `undefined`, la llamada tiraba `TypeError`, el `catch` lo absorbía con un `console.warn` y la validación caía siempre al chequeo por extensión:

```
$ node -e "import('file-type').then(m=>console.log(Object.keys(m.default)))"
[ 'fromFile', 'fromStream', 'fromTokenizer', 'fromBuffer', 'stream' ]
```

Como los comprobantes usan `memoryStorage`, `req.file.path` nunca existe, por lo que la rama de validación profunda era además inalcanzable. En la práctica bastaba renombrar el archivo y declarar el MIME para subir cualquier contenido, contra lo que afirma el README.

**Corrección.** Se valida el buffer con `fromBuffer`. Se rechaza solo cuando se detecta un tipo concreto no permitido; si no se detecta nada se mantiene el *fail-open* previo para no rechazar archivos válidos. Verificado: un GIF renombrado a `.png` con MIME declarado `image/png` se rechaza; PNG y PDF reales se aceptan.

---

## 3. Altos

### A-1. El endpoint con permisos de comprobantes devolvía 404 siempre (corregido)

`GET /api/egresos/:id/comprobante` buscaba en disco `comprobante_filename`, que guarda el nombre original de la subida, mientras que el archivo se escribe con prefijo de timestamp:

| En disco | En la base (`comprobante_filename`) |
|----------|--------------------------------------|
| `1790833470096_c.png` | `c.png` |

Para comprobantes en disco local, la única ruta con control de permisos nunca servía el archivo. El frontend lo tapaba usando `comprobante_url` directo, que apunta al montaje **público** `/uploads`. Es decir, el control de acceso por rol existía pero no se usaba.

**Corrección.** El nombre se deriva de `comprobante_url` con `path.basename()` para que un `comprobante_url` manipulado no pueda salir de `UPLOAD_DIR`. Verificado: los cuatro comprobantes de prueba se sirven con 200 y el tipo correcto, y un `comprobante_url` con `..%2f..%2f.env` devuelve 404 sin filtrar el archivo.

### A-2. Los comprobantes son públicos (NO corregido — requiere decisión de arquitectura)

El README afirma "Archivos protegidos: Solo usuarios autenticados pueden descargar comprobantes". No es así, por dos vías:

1. `app.use('/'+UPLOAD_DIR, express.static(uploadsPath))` en `server.js:121` sirve el directorio de uploads sin ningún middleware. Cualquiera con la URL ve el comprobante.
2. Cuando `IMGBB_API_KEY` está configurada (el camino principal en producción), los archivos se suben a ImgBB, que los publica en URLs públicas permanentes. `imgbb.js` documenta además que el plan gratuito **no tiene API de borrado**, así que los comprobantes no se pueden eliminar ni por retención ni por pedido.

Son fotos de transferencias bancarias con nombres, CBU/alias y montos de terceros. Las URLs además viajan en el CSV de egresos (columna `comprobante_url`), que se comparte por fuera del sistema.

**Recomendación.** Con A-1 corregido, `/api/egresos/:id/comprobante` ya es un camino funcional y con permisos. El plan sería: (1) que el frontend use siempre ese endpoint en lugar de `comprobante_url`; (2) quitar el montaje estático `/uploads`; (3) migrar a un almacenamiento con objetos privados y URLs firmadas de corta vida (S3/R2/GCS), que además devuelve la capacidad de borrar. No se tocó acá porque cambia el flujo de almacenamiento y necesita migrar los registros existentes.

### A-3. El historial de cambios es parcial y pierde el motivo (NO corregido)

El sistema se presenta como de auditoría, pero el rastro de cambios tiene huecos:

- El trigger `log_egreso_change` (migración 006) solo registra `monto`, `status`, `fecha`, `etiqueta`, `cuenta_receptora` y `notas`. Quedan **sin historial**: `moneda`, `tipo_transaccion`, `monto_raw`, `empresa_salida`, `cuenta_salida`, `id_transferencia`, `turno`, `hora`, `usuario_casino`, `hora_solicitud_cliente`, `hora_quema_fichas`. Cambiar la moneda de un egreso de ARS a USD no deja rastro en `egresos_history`.
- `PUT /api/egresos/:id` exige `change_reason` y lo valida, pero lo guarda únicamente en `audit_logs.details`. La columna `egresos_history.change_reason` existe y queda en `NULL`, así que el modal "Historial de cambios" muestra los cambios sin el motivo que se obligó a escribir.
- `PUT` fuerza `status = 'editada'` en cada edición, pisando `activo` / `pendiente`. Se pierde el estado anterior y el filtro por estado deja de distinguir "activo" de "activo pero editado alguna vez". Como efecto lateral, el trigger interpreta ese cambio de estado como `'REACTIVAR'` y agrega una entrada engañosa al historial.

**Recomendación.** Ampliar el trigger a todas las columnas de negocio (o pasar a un `jsonb` con el `row_to_json` de OLD/NEW), propagar `change_reason` a `egresos_history`, y separar "editado" en un flag o un `edited_at` en lugar de ocupar `status`.

### A-4. Un empleado puede borrar definitivamente un egreso (NO corregido)

`DELETE /api/egresos/:id` permite a cualquier `empleado` o `encargado` borrar sus propios egresos con `DELETE FROM egresos`, y `egresos_history` tiene `ON DELETE CASCADE`, así que se va también el historial. En `audit_logs` queda el `EGRESO_DELETE`, pero el registro contable desaparece.

Para un sistema de auditoría de dinero es un control débil: la figura correcta ya existe (`POST /:id/anular`, solo admin, con motivo obligatorio y preservando la fila).

**Recomendación.** Restringir `DELETE` a admin, o eliminarlo y dejar solo la anulación. No se cambió porque altera permisos que la operación usa hoy y requiere acordarlo con el negocio.

### A-5. Enumeración de usuarios en el login (corregido)

Con el bloqueo por intentos desactivado (`MAX_LOGIN_ATTEMPTS = 999`), el mensaje `Credenciales inválidas. 998 intento(s) restante(s).` aparecía **solo si el username existía**; uno inexistente devolvía `Credenciales inválidas` seco. Eso permite enumerar usuarios válidos antes de atacar contraseñas.

**Corrección.** El contador se informa solo si el bloqueo está realmente activo, así la lógica sigue sirviendo si se reactiva.

**Pendiente menor.** `Usuario desactivado` (403) sigue confirmando que el username existe. Es un trade-off razonable con la usabilidad; queda anotado.

---

## 4. Medios

### M-1. Sin rate limiting efectivo (NO corregido)

`apiLimiter` está definido en `rateLimiter.js` y **nunca se usa**: ninguna ruta de la API tiene límite. `loginLimiter` permite 100 intentos por minuto por IP y el bloqueo por cuenta está desactivado a propósito, así que con bcrypt cost 12 un atacante tiene ~100 pruebas de contraseña por minuto por IP, sin tope.

No se activó `apiLimiter` tal como está (100 req / 15 min) porque rompería el uso normal: un turno de carga supera eso fácil entre listados, filtros y subidas.

**Recomendación.** Límites por tipo de operación en lugar de uno global: estricto en `/api/auth/login` (p. ej. 10/min por IP + backoff por usuario), generoso en lectura, intermedio en escritura y exportaciones CSV.

### M-2. `audit_logs` crece con cada listado (NO corregido)

`GET /api/egresos` escribe un `EGRESO_LIST` en `audit_logs` por request, con `details: req.query` completo. Con 1000+ transacciones diarias y el frontend recargando en cada cambio de filtro y de página, la tabla de auditoría se llena de ruido de navegación que tapa los eventos que importan (`EGRESO_CREATE`, `EGRESO_UPDATE`, `EGRESO_ANULAR`) y degrada las consultas de `logs.html`.

**Recomendación.** No auditar lecturas de listado (sí las exportaciones CSV y el acceso a comprobantes, que son extracción de datos), o guardarlas agregadas.

### M-3. Las consultas de saldos no pueden usar el índice de `fecha` (NO corregido)

`computeSaldos` envuelve la columna en `TO_DATE(fecha::text, ...)`:

```sql
(CASE WHEN fecha::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      THEN TO_DATE(fecha::text, 'YYYY-MM-DD')
      ELSE TO_DATE(fecha::text, 'DD/MM/YYYY') END)
```

`egresos.fecha` es `DATE` desde la migración 001 y ninguna migración la cambió, así que el regex siempre matchea la primera rama y todo el `CASE` es un round-trip date→text→date. El costo real es que la expresión no es sargable: `idx_egresos_fecha` queda sin usar y cada cálculo de saldos hace un scan completo (y se calculan dos meses por request, el actual y el anterior). Hoy se tapa con el caché de 15 s.

**Recomendación.** Comparar `fecha` directo contra los límites del período. Conviene confirmar antes en la base de producción que el tipo es `DATE` (`\d egresos`), porque el código sugiere que alguna vez hubo fechas guardadas como texto.

### M-4. Migraciones no atómicas (corregido)

`runMigrations` ejecutaba el DDL y el `INSERT INTO schema_migrations` como dos queries sueltas. Si la segunda fallaba, la migración quedaba aplicada pero sin registrar, y se reintentaba en el arranque siguiente. Ahora van en una transacción con `ROLLBACK`.

### M-5. Dos corredores de migraciones incompatibles (NO corregido)

`src/migrate.js` es un segundo corredor con un esquema **incompatible** del registro: usa `schema_migrations(version)` mientras que el que corre en el arranque usa `schema_migrations(filename)`. Como ambos hacen `CREATE TABLE IF NOT EXISTS`, el segundo en ejecutarse encuentra la tabla con las columnas del otro y falla (o deja de registrar). No está referenciado en `package.json`.

**Recomendación.** Borrar `src/migrate.js`.

### M-6. La IP de auditoría era falseable (corregido)

`auditLog` tomaba el primer valor de `X-Forwarded-For` crudo, que cualquier cliente puede mandar a mano, ensuciando el registro de auditoría con IPs inventadas. Pasa a usar `req.ip`, que ya resuelve el header según el `trust proxy` configurado.

### M-7. `uncaughtException` salía con código 0 (corregido)

Una excepción no capturada llamaba a `gracefulShutdown`, que hacía `process.exit(0)`: el orquestador lo veía como cierre limpio. Ahora sale con 1.

### M-8. CORS permisivo por defecto (NO corregido)

Si `CORS_ORIGIN` no está seteada, la configuración es `origin: true`, que refleja cualquier `Origin` recibido. El impacto está limitado porque `credentials: false` y el token va en un header que el navegador no agrega solo, pero conviene que falte-variable signifique "cerrado" y no "abierto".

**Recomendación.** Exigir `CORS_ORIGIN` en `validateRequiredEnv` cuando `NODE_ENV=production`.

---

## 5. Bajos y deuda técnica

| # | Hallazgo | Estado |
|---|----------|--------|
| B-1 | `/api/egresos/debug/uploads` listaba el directorio de uploads y los últimos registros de la tabla para cualquier usuario autenticado | Corregido: requiere admin |
| B-2 | Constantes de negocio duplicadas: `EMPRESAS_SALIDA`, `ETIQUETAS_*` y `parseMontoARSStrict` están copiadas entre `backend/src/utils/validators.js` y `frontend/public/app-shared.js`. Las opciones reales viven en la tabla `select_options` desde la migración 031, así que las dos copias son fallbacks que ya divergen del origen de verdad | Anotado |
| B-3 | `TURNOS_CIERRE` (`egresos.js`) y `CIERRE_TURNOS` (`app-cierres-caja.js`) son la misma lista escrita dos veces | Anotado |
| B-4 | `app.js` del frontend es un stub de 2 líneas que no referencia ningún HTML | Anotado |
| B-5 | Restos de Cloudflare R2, eliminado del código: `test-r2-curl.sh`, `scripts/tests/test-r2-*.js` y 8 variables `R2_*` en `.env.example` | `.env.example` actualizado; scripts anotados |
| B-6 | `.env.example` desalineado: documenta `PG_POOL_MIN=10/PG_POOL_MAX=40` cuando `db.js` usa 2/20 por defecto, y `MAX_PAGE_SIZE`, `FILE_RETENTION_MONTHS`, `AUDIT_RETENTION_MONTHS` no se leen en ningún lado | Corregido |
| B-7 | README desactualizado: dice tokens de 24 h (son 12 h), rate limit de 5 intentos / 15 min (son 100/min), y el frontend en `frontend/public` cuando está en `backend/frontend/public` | Corregido |
| B-8 | 45 archivos en `docs/`, muchos son bitácoras de incidentes ya cerrados (`DEBUGGING_*`, `SOLUCION_*_R2`, `CAMBIOS_ALERTAS copy.md`). Dificultan encontrar la documentación vigente | Anotado |
| B-9 | `npm audit` reporta 12 vulnerabilidades (1 crítica en `tar` vía `bcrypt@5`, 7 altas). `multer@1.x` está sin soporte | Anotado, ver abajo |
| B-10 | Sin tests automatizados de ningún tipo. Los tres bugs C-2, C-3 y C-4 son del tipo que un test de integración mínimo habría detectado | Anotado |
| B-11 | Listeners duplicados al re-renderizar: `bindUserRowActions` (`app-usuarios.js`) y `bindTableActions` (`app-configuracion.js`) vuelven a enganchar handlers en cada render, así que un click puede disparar la acción varias veces | Anotado |
| B-12 | `downloadCSVFiltrado` (`app-historial.js`) no envía el filtro `status`, que sí usa la búsqueda: el CSV no coincide con lo que se ve en pantalla | Anotado |
| B-13 | `limpiarFiltros` (`app-historial.js`) resetea `currentFilters` a `{}` pero no limpia los selects de `status`, `moneda`, `turno`, `cuenta_receptora` ni `created_by`, así que la búsqueda siguiente arranca con filtros fantasma. Además el `colspan` del mensaje vacío es 9 y la tabla tiene 11 columnas | Anotado |
| B-14 | `buscarEgresos` y `refreshKPI` no serializan ni cancelan requests: al cambiar filtros rápido puede pintarse una respuesta vieja sobre una nueva. `cargarSaldos` ya resuelve esto con `saldosReqSerial`; conviene aplicar el mismo patrón | Anotado |

### Sobre B-9 (dependencias)

`npm audit fix` resuelve 11 de las 12 sin cambios de API (`express`, `qs`, `body-parser`, `brace-expansion`, `minimatch`, `path-to-regexp`, `ip-address`, `express-rate-limit`). La crítica de `tar` llega por `bcrypt@5 → @mapbox/node-pre-gyp` y requiere `bcrypt@6`, que es un major. No se tocó en esta auditoría porque `bcrypt` es el que valida todas las contraseñas y actualizarlo merece su propio cambio con verificación de que los hashes existentes siguen validando (lo hacen: el formato `$2b$` no cambia, pero hay que probarlo). `multer@1.x` debería ir a `2.x`.

---

## 6. Lo que se corrigió en esta auditoría

Un commit por hallazgo, todos verificados contra la aplicación corriendo:

1. `fix(seguridad)` — endpoints de mantenimiento detrás de `ENABLE_MAINTENANCE_ENDPOINTS` + admin; `?token=` limitado a SSE y mantenimiento; eliminado `run-migrations-web.js`.
2. `fix(notificaciones)` — frames SSE con saltos de línea reales + heartbeat de 25 s.
3. `fix(comprobantes)` — nombre real del archivo en disco, con protección contra path traversal; `/debug/uploads` solo admin.
4. `fix(uploads)` — validación por magic numbers funcionando (`fromBuffer`).
5. `fix(login)` — sin enumeración de usuarios.
6. `fix(robustez)` — migraciones en transacción, IP de auditoría no falseable, exit code 1 en crash.
7. `fix(xss)` — `escapeHtml()` en todos los sinks de HTML.
8. `fix(csp)` — `script-src 'self'` sin `unsafe-inline`; de paso se arreglaron tres handlers inline que la CSP ya bloqueaba (Enter en los filtros de saldos recargaba la página; el backdrop no cerraba el modal de detalle; el fallback de imagen del comprobante no se mostraba).
9. `docs` — esta auditoría y corrección de README / `.env.example`.

Ningún cambio altera contratos de API, esquema de base de datos, permisos por rol ni flujos de la UI.

---

## 7. Orden sugerido para lo que queda

**Antes de seguir agregando funcionalidad**

1. Borrar los endpoints de mantenimiento y `src/migrate.js` (C-1, M-5). Hoy están apagados, pero siguen siendo DDL hardcodeada que puede volver a divergir del esquema.
2. Completar el rastro de auditoría (A-3): es la razón de ser del sistema y hoy tiene huecos en campos de dinero.
3. Decidir el modelo de permisos del borrado (A-4).

**Siguiente**

4. Comprobantes privados con URLs firmadas (A-2). Es el cambio más invasivo y el único que necesita migrar datos.
5. Rate limiting por tipo de operación (M-1) y dejar de auditar los listados (M-2).
6. `npm audit fix` + `bcrypt@6` + `multer@2` en un cambio propio, verificando que los hashes existentes siguen validando (B-9).

**Cuando haya margen**

7. Un set mínimo de tests de integración sobre el backend: login, alta de egreso con archivo, permisos por rol, export CSV, saldos. Los tres bugs invisibles de esta auditoría (C-2, C-3, C-4) caen con eso.
8. Unificar las constantes de negocio contra `select_options` y borrar las copias (B-2, B-3).
9. Limpiar `docs/` y los restos de R2 (B-5, B-8).
10. Los bugs de UI anotados (B-11 a B-14).
