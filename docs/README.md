# Documentación — GATE

> **Empezar acá** al abrir una instancia nueva de Cursor en esta carpeta.
>
> **Nombre:** el programa se llama **GATE**. Los identificadores técnicos de integración
> (`RECEIPT_GATE_*`, paquete npm `receipt-gate`, contenedor `receipt-gate`) se mantienen
> por compatibilidad con CRM y PAM — no renombrar sin coordinar los 3 repos.

| Orden | Doc | Para qué |
|-------|-----|----------|
| 1 | [00_CONTEXTO.md](./00_CONTEXTO.md) | Qué es este programa, por qué existe, decisiones tomadas |
| 2 | [01_ARQUITECTURA.md](./01_ARQUITECTURA.md) | Pipeline E0–E4, qué corre en cada servidor, fail-policy |
| 3 | [02_CAPA_1.md](./02_CAPA_1.md) | Capa 1 implementada (6 capas + parámetros + mensajes) |
| 4 | [03_CAPA_2.md](./03_CAPA_2.md) | Capa 2 (forense E3 + banco E3b): implementada, multi-proveedor IA |
| 5 | [04_AUDITORIA_F1_F14.md](./04_AUDITORIA_F1_F14.md) | Auditoría del gate original (CRM) + decisiones |
| 6 | [05_INTEGRACION_CRM_PAM.md](./05_INTEGRACION_CRM_PAM.md) | **Sinergia CRM↔Gate↔PAM**: funciones, protocolo por origen, qué necesita cada repo |
| 0 | [ESTADO.md](./ESTADO.md) | **EMPEZÁ ACÁ** — punto actual, pendientes con dueño, outbox de mensajes, qué está live |
| 7 | [06_PENDIENTES.md](./06_PENDIENTES.md) | Decisiones cerradas y gate de calidad (referencia, no estado) |
| 7b | [historial/](./historial/) | Historia por mes: el por qué de lo ya resuelto |
| 8 | [08_RUNBOOK.md](./08_RUNBOOK.md) | Cómo levantar y testear el gate (local + CRM + Docker) · **§9 wipe UAT dedup** |
| 9 | [09_MIGRACION_GATE_HOST.md](./09_MIGRACION_GATE_HOST.md) | Plan de migración: gate co-ubicado → EC2 dedicado |
| 10 | [10_DEPLOY_Y_CUTOVER.md](./10_DEPLOY_Y_CUTOVER.md) | **Vitácora deploy PROD + cutover scan_id** (GATE×CRM×PAM): hosts, IPs, SG, estado y checklist |
| 11 | [11_HANDOFF_GATE_TEST_E2E.md](./11_HANDOFF_GATE_TEST_E2E.md) | Handoff gate-test (token resuelto vía PAM; opcional solo si falla OCR) |
| 12 | [12_TRAZA_FEED.md](./12_TRAZA_FEED.md) | **`GET /traza/v1/feed`** (instancia TRAZA) + **scopes por token**. Empezar por § 1: sólo lista aceptados y el horizonte es de 7 días |
| — | [07_CREDENCIALES.md](./07_CREDENCIALES.md) | Vault local: secretos fuera de main, un solo lugar |

> **Estado (jul-2026):** Acta E2E integración **cerrada** · UAT tester · wipe dedup GATE prod (2026-07-02).
> GATE backlog: G5 sandbox · Anthropic. Ops UAT: `08` §9 · handoff: `10` §0.

## Repos hermanos

| Repo / carpeta | Rol |
|----------------|-----|
| `C:\Users\lauta\Desktop\CRM` | Cerebro conversacional; cliente HTTP del gate ya cableado (livechat) |
| `C:\Users\lauta\Desktop\Programa Comprobantes` | **Este repo (GATE)** — servicio aislado: saneo + extracción IA + banco + vista segura |
| Black Dragon (PAM) | Fuente de verdad de dinero (match PSP + acreditación); cliente del gate (pendiente) |

## Código de referencia (origen del port)

La Capa 1 nació en el CRM y se portó acá en el commit inicial `c7b132c`:

- CRM (histórico): `CRM/app/backend/src/receipt-gate/`
- CRM (docs diseño): `CRM/docs/04_CAPA_SEGURIDAD_COMPROBANTES/`
- CRM (handoff PAM viejo): `CRM/docs/pam/05_CAPA_1_COMPROBANTES.md` — **desactualizado** (asumía Capa 1 en CRM)

Este repo es la **fuente de verdad** a partir de jun-2026.
