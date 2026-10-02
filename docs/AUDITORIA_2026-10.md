# Auditoría técnica — Sistema de Egresos Mooney Maker

Fecha: 2026-10-01 · Actualizado: 2026-10-02 · Alcance: repositorio completo.

Todo lo verificado se reprodujo levantando la aplicación contra un PostgreSQL 16
local y, donde aplica, con `npm test` (11 casos de integración).

---

## 1. Resumen

| Severidad | Hallazgos | Corregidos |
|-----------|-----------|------------|
| Crítica   | 4 | 4 |
| Alta      | 5 | 4 (A-2 pospuesto a pedido: comprobantes ImgBB) |
| Media     | 8 | 8 |
| Baja / deuda técnica | 14 | 12 |

**A-2 (comprobantes privados)** quedó fuera de alcance por pedido explícito:
seguir con ImgBB público. El resto del backlog de la auditoría se aplicó.

Ningún cambio rompe los flujos de la UI. Los únicos cambios de permisos/
comportamiento acordados son: DELETE de egresos solo admin, historial de
cambios completo, y filtros `status=editada` basados en `edited_at`.

---

## 2. Críticos (todos corregidos)

| # | Hallazgo | Fix |
|---|----------|-----|
| C-1 | Endpoints de mantenimiento con DDL abiertos / después apagados pero peligrosos | Eliminados (`run-migrations`, `check-migrations`, `init-admin`, `fix-id-transferencia`, `maintenance.js`, `migrate.js`). Primer admin solo vía `npm run seed:admin` |
| C-2 | XSS almacenado empleado→admin | `escapeHtml` en sinks + CSP `script-src 'self'` |
| C-3 | SSE nunca entregaba eventos | Frames con `\n\n` reales + heartbeat |
| C-4 | Validación magic numbers no corría | `fromBuffer` de file-type@16 |

---

## 3. Altos

| # | Hallazgo | Estado |
|---|----------|--------|
| A-1 | Comprobante local siempre 404 | Corregido |
| A-2 | Comprobantes públicos (ImgBB + `/uploads` estático) | **Pospuesto** — requiere otro proveedor y migrar archivos |
| A-3 | Historial parcial, sin motivo, status='editada' pisaba estado | Corregido (migración 032: `edited_at`, trigger completo, `change_reason`) |
| A-4 | Empleado podía borrar egresos (y el historial por CASCADE) | Corregido: DELETE solo admin; el resto anula |
| A-5 | Enumeración de usuarios en login | Corregido |

---

## 4. Medios (todos corregidos)

| # | Hallazgo | Fix |
|---|----------|-----|
| M-1 | Sin rate limiting efectivo | login 10/min, lectura 300/min, escritura 60/min, CSV 30/15min |
| M-2 | `EGRESO_LIST` ensuciaba audit_logs | Deja de auditarse; CSV y comprobantes sí |
| M-3 | Saldos con `TO_DATE(fecha::text)` no usaban índice | Comparación directa sobre `DATE` |
| M-4 | Migraciones no atómicas | Transacción por archivo |
| M-5 | Segundo corredor `migrate.js` incompatible | Eliminado |
| M-6 | IP de auditoría falseable | Usa `req.ip` |
| M-7 | `uncaughtException` salía con código 0 | Sale con 1 |
| M-8 | CORS abierto si faltaba la variable | En producción exige `CORS_ORIGIN` concreto |

---

## 5. Bajos y deuda

| # | Hallazgo | Estado |
|---|----------|--------|
| B-1 | `/debug/uploads` abierto | Corregido (admin) |
| B-2 | Constantes empresas/etiquetas duplicadas | Fallbacks documentados; origen de verdad = `select_options` |
| B-3 | `TURNOS_CIERRE` duplicado | Una definición en backend (`validators.js`) y una en frontend (`app-shared.js`) |
| B-4 | Stub `app.js` | Eliminado |
| B-5 | Restos R2 | Scripts de test R2 eliminados; docs R2 a `docs/_archivo/` |
| B-6 | `.env.example` desalineado | Corregido |
| B-7 | README desactualizado | Corregido |
| B-8 | Docs de incidentes mezclados con vigentes | Movidos a `docs/_archivo/` |
| B-9 | Vulnerabilidades npm | `npm audit fix` + `bcrypt@6` + `multer@2`. Queda 1 moderate en `file-type@16` (subir a v22 es breaking) |
| B-10 | Sin tests | `npm test` — 11 casos de integración |
| B-11 | Listeners duplicados | Delegación de eventos en usuarios y configuración |
| B-12 | CSV sin filtro status | Corregido (frontend + backend) |
| B-13 | Filtros fantasma / colspan | Corregido |
| B-14 | Carreras en `buscarEgresos` | Serial de request |

Además se quitó la contraseña en claro que figuraba en
`docs/CREDENCIALES_PRODUCCION.md`. Si esa clave se usó en producción, rotarla.

---

## 6. Commits de esta auditoría (orden)

1. `fix(seguridad)` — cerrar mantenimiento + acotar `?token=`
2. `fix(notificaciones)` — SSE
3. `fix(comprobantes)` — servir archivo real
4. `fix(uploads)` — magic numbers
5. `fix(login)` — sin enumeración
6. `fix(robustez)` — migraciones atómicas, IP, exit code
7. `fix(xss)` / `fix(csp)`
8. `docs` — informe + READMEs + `.env.example`
9. `refactor(mantenimiento)` — borrar endpoints DDL y `migrate.js`
10. `fix(auditoria)` — historial completo (032)
11. `fix(permisos)` — DELETE solo admin
12. `fix(seguridad)` — rate limits, saldos sargables, CORS prod, sin EGRESO_LIST
13. `fix(ui)` — CSV/status, filtros, listeners
14. `refactor` — TURNOS_CIERRE único
15. `chore(deps)` — bcrypt@6, multer@2, audit fix
16. tests + limpieza docs/R2/stub + quitar password del doc

---

## 7. Lo que queda (solo A-2)

Cuando se decida abandonar ImgBB:

1. Frontend siempre usa `GET /api/egresos/:id/comprobante` (ya funciona).
2. Quitar `express.static` de `/uploads`.
3. Migrar a almacenamiento con objetos privados y URLs firmadas (S3/R2/GCS)
   y re-subir los comprobantes existentes.

---

## 8. Cómo verificar

```bash
cd backend
# con el servidor levantado y un admin de prueba:
npm test
```
