# Decisiones cerradas y gate de calidad — GATE

> **Referencia, no estado.** Lo que rige cómo está armado este servicio y cómo se valida antes de
> mergear. Cambia poco.
>
> **¿Buscás en qué estamos?** → [ESTADO.md](ESTADO.md): punto actual, pendientes con dueño, outbox
> de mensajes y qué está live.
> **¿Buscás el por qué de algo ya resuelto?** → [historial/](historial/).
>
> Este archivo tenía 404 líneas y mezclaba tres cosas: pendientes, narrativa de lo resuelto, y un
> "PUNTO ACTUAL" congelado el 16/07 con todos sus ítems ya cerrados. Se separó el 28/07/2026.

---

### ⏳ Pendiente — **solo este repo**

| # | Tarea | Prioridad |
|---|-------|-----------|
| G1 | ✅ Docs internas al día (API real, Capa 2, arquitectura E0–E3b) | — |
| G2 | ✅ Convención `subject_id` + `channel` documentada (`05` § 7) | — |
| G3 | ✅ `GET /scans/:id` — metadata de operación | — |
| G4 | ✅ Job limpieza comprobantes expirados (`expires_at`) — `cleanupExpiredReceipts`, corre al arrancar + cada `RECEIPT_CLEANUP_INTERVAL_MIN` | — |
| G5 | Sandbox efímero por archivo poppler/sharp (F4) | Alta prod |
| G6 | ✅ Docker/prod config (tokens, VIEW_SECRET, PUBLIC_URL, keys IA) + runbook (`08_RUNBOOK.md`); egress/firewall = deploy | — |
| G7 | ✅ Sinergia CRM↔Gate↔PAM en `05_INTEGRACION_CRM_PAM.md` | — |
| G8 | PDF multi-página (hoy solo 1ª página) — evaluar si hace falta | Baja |
| G9 | ✅ Smoke ambos canales (`crm_livechat`+`pam_panel`) + test-real (43 comprobantes, banco verificado) | — |
| C-CRM | ✅ CRM cableado a `client=http` apuntando al gate (`CRM/app/backend/.env`) | — |
| G10 | Vault credenciales central (`Desktop\credenciales\`) — ver `docs/07_CREDENCIALES.md` | ✅ Hecho |

### 🔒 Fuera de alcance (otras instancias / repos)

| # | Tarea | Repo |
|---|-------|------|
| I2 | Cliente gate + view_url en operaciones | PAM |
| I4 | Descarga media Kommo → gate | CRM |
| I5 | Deprecar gate local embebido | CRM |
| — | Docs maestras CRM/PAM | CRM / PAM |

## Decisiones cerradas

1. **Repo propio** hermano de CRM y PAM (no dentro del CRM).
2. **Host aislado** — parsers riesgosos fuera del PAM.
3. **Capa 1 (E0–E2) + extracción forense (E3)** en este programa; PAM solo match/acreditación (otro repo).
4. **Fail-closed** si gate/ClamAV no responde (no pasar crudo al PAM).
5. **Dedup centralizado** en SQLite del gate por `subject_id`.
6. **Clasificador stub** (F7): juez semántico = PAM.
7. **WhatsApp** descarga media: Fase WP, no bloquea gate MVP.

## Gate de calidad (este repo)

```bash
npm run typecheck
npm run build
node scripts/smoke.mjs http://localhost:4100   # con server corriendo
npm run audit:acentos                          # + --ext ts,mjs para el fuente
```

**`smoke.mjs` es la cobertura del contrato de `/scan`, y corre sin credencial.** Fuera de `production`
y sin tokens cargados, `requireAuth` deja pasar (`server.ts:51-58`), así que el saneo E0–E2, los
rechazos de borde, el `duplicate` y la forma de la respuesta se ejercitan en cada gate. Lo que **no**
puede ver es la deriva del host desplegado —sidecar de ClamAV, flags del entorno, límites de nginx—, y
esa categoría ya nos mordió: el 13/08 un deploy apagó dos flags de contrato en gate-test. Correrlo
contra un host desplegado es el caso que QA dejó bloqueado por G-TEST-SSH (desdoble acordado 28/08).

**Las suites automáticas son 12, y `test:ocr-code` NO es una de ellas.** Lleva el prefijo `test:`
pero es una herramienta manual: pide `-- <imagen.jpg> <CODIGO_ESPERADO>`, gasta crédito de IA y sale
con código **2** mostrando el uso. Cualquier bucle que corra todos los `test:*` la va a contar como
roja. Verificado el 26/08: 12 verdes y esa falsa roja.

**`audit:acentos` no corrige, clasifica.** En el fuente, 337 palabras sin tilde reparten así: 249
identificadores, 59 dentro de prompts (cambiarlos cambia la salida del modelo — el año se midió 5/5
con ESE texto), 26 cadenas que viajan a PAM o a los logs (`CRITICO:` lo parsea su lado, y
`"pago facil"` sin tilde es lo que hace que matchee el OCR) y **0** de prosa. Los `.md` están al día:
22 archivos, 0 faltas, 0 corrupción.

