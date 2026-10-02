---
name: gate-workspace
description: >-
  Operates the GATE (Programa Comprobantes) workspace — E0–E4 pipeline, POST /scan
  contract, ClamAV, forensic OCR, deploy gate-test/prod. Use in this repo when
  debugging scan failures, integration with CRM/PAM, smoke tests, or gate infra.
---

# GATE workspace

## Protocolo de Trabajo (PTM) — obligatorio

Seguir `E:\credenciales\docs\11_PROTOCOLO_TRABAJO.md` (PTM **v5.2**). Resumen de reglas:

- **R1** comunicación a CRM/PAM en bloque **copy-paste** (§2 del protocolo)
- **R2** auditar el módulo antes de tocar / al perder contexto
- **R3** registrar avance según la vida útil del dato: estado → `docs/ESTADO.md` · qué se hizo, ya
  cerrado → `docs/historial/<AAAA-MM>.md` · sólo lo que **cruza a otra instancia** →
  `credenciales/docs/PLAN_ACCION.md`. **No** volcar todo en `06_PENDIENTES.md`: esa instrucción vieja
  lo dejó con 404 líneas y un "PUNTO ACTUAL" congelado once días
- **R5** un chat = un módulo
- **R6** terminar cada respuesta con **Resumen ejecutivo**

## Contexto de instancia

Este repo corre en **su propio workspace Cursor local**. No editar CRM/PAM acá;
coordinar contratos vía `docs/05_INTEGRACION_CRM_PAM.md` (canon) y **avisar con bloque R1**.

GATE es **dueño del contrato `/scan`**: edita primero, avisa después a CRM y PAM.

## Inicio de sesión (siempre)

> **Ecosistema migrado a disco `E:` (PTM v5.x).** El vault es `E:\credenciales` (`CREDENCIALES_ROOT`).
> Rutas viejas `C:\Users\lauta\Desktop\credenciales` **quedaron obsoletas**.

1. **`docs/ESTADO.md`** → `docs/README.md` (índice) → `docs/10_DEPLOY_Y_CUTOVER.md` si hay deploy
2. Secretos: `E:\credenciales\GATE\local.env` (ver `docs/07_CREDENCIALES.md`)
3. Hermano CRM: `E:\Proyectos\CRM`
4. Hermano PAM: `E:\Proyectos\Black Dragon V1.0.1` · PAM-CRM worktree: `E:\Proyectos\PAM-crm`

**Contexto ops (2026-07-24):** gate prod + gate-test con la última build LIVE (dist verificado:
`global-dedup.js`, `computeDuplicateGlobal`, `cross_user`). prod `clamav.ok:true`+`ai:true`; gate-test
`ai:true` (ClamAV suele estar caído en test) · watchdog ClamAV systemd + swap 2G.
- **#220 RESUELTO y LIVE** (dedup pHash per-subject **no** auto-rechaza; solo sha256 exacto bloquea +
  retry Anthropic 529). **Ya mergeado a `main`** (`1fb3d61`).
- **#258 (CROSS-X01b) LIVE:** `duplicate_global` enriquecido cross-user (sha256 | pHash+contenido).
  Commit `a98d80c` en `main`, desplegado prod+test por SSH/tarball. Contrato `docs/05` v1.1.

## Accesos e infra (para trabajar fluido)

> **Regla de acceso:** esta instancia tiene **SSH a los hosts**, NO tiene credenciales AWS. El SG/allowlist
> :443 se cambia por **consola (Owner)** o con el IAM user `gate-sg-manager` (ver abajo). Para **correr**
> pruebas `/scan` (ej. CROSS-09) **alcanza con SSH** desde el host — no hace falta tocar SG ni IP.

| Host | IP | Deploy dir | Acceso SSH |
|------|-----|-----------|-----------|
| **gate prod** (`gate.megamooneymaker.com`) | `3.12.87.253` (i-0f8428f7b82c2e75a, us-east-2) | `~/gate` | **directo** desde local: key `E:\credenciales\GATE\keys\GateAI.pem` |
| **gate-test** (`gate-test.megamooneymaker.com`) | `18.225.198.243` | `~/receipt-gate` | **jump vía PAM**: `PAM 3.15.65.122` (`~/.ssh/megamm-key.pem`) → gate-test con `~/.ssh/Gate.pem` (vive en el host PAM, NO en el vault) |
| PAM (jump box) | `3.15.65.122` | — | key `C:\Users\lauta\.ssh\megamm-key.pem` |

**Gotchas confirmados (ahorran tiempo):**
- **ACL de la key del vault:** OpenSSH Windows rechaza `GateAI.pem` con permisos heredados. Copiar a temp y
  restringir: `Copy-Item ...\GateAI.pem $env:TEMP\GateAI.pem; icacls $tmp /inheritance:r; icacls $tmp /grant:r "$($env:USERNAME):(R)"`. Borrar al terminar.
- **Comandos SSH inline se rompen con `(` `)`** (PowerShell/bash mangling de comillas). Para cualquier script
  remoto no trivial: escribir un `.sh` (LF), `scp` al host y `ssh host "bash /tmp/x.sh"`. Es el patrón fiable
  para deploy, health y probes.
- **Deploy (ambos):** tarball `src + package*.json + tsconfig.json` → extraer en el deploy dir → backup del `src`
  previo (`/tmp/gate-src-bak-*`) → `docker compose --env-file <dir>/.env up --build -d gate` → verificar `dist`
  en el contenedor + `/health`. El build es multi-stage (dist vive dentro del image, no en el host).
- **SG allowlist :443:** solo IPs whitelisteadas (prod `sg-0b9abb8d6c9927f4b`, test `sg-07d12df127a944052`,
  us-east-2). Alta: consola AWS (Owner) **o** `scripts/aws/gate-allow-ip.ps1 -Ip <ip> -Env prod|test`
  (necesita credencial del IAM user `gate-sg-manager` cargada en el entorno; policy en `scripts/aws/gate-sg-manager-policy.json`).

**Correr CROSS-09 G01–G05 por SSH** (evidencia para Qase; QA marca PASS, no el dev): `scp` de una imagen real +
un probe `.sh` que hace `POST /scan` contra `127.0.0.1:4100` con el token de `RECEIPT_GATE_TOKENS` del `.env`
del host. Cubre G01 (accepted+scan_id+OCR), G02 too_small, G03 bad_type, G04 duplicado (sha256), G05 401.

## Qué es GATE

Servicio Node/TS **aislado**. Sanea comprobantes (E0–E4). **No decide dinero.**

| Capa | Código | Qué hace |
|------|--------|----------|
| E0–E2 | `src/gate/receipt-gate.ts` | flood, ClamAV, MIME, JPEG re-encode, pHash |
| E3–E4 | `src/pipeline/process-scan.ts` | OCR IA, banco, validación, SQLite, view URL |
| HTTP | `src/http/server.ts` | `/scan`, `/scans/:id`, `/receipts/:id`, `/health` |

## Contrato v1 (congelado)

**POST `/scan`** — Bearer `RECEIPT_GATE_TOKENS` (CSV: token[0]=CRM, token[1]=PAM)

```json
{ "subject_id", "channel", "data_base64", "phone?", "filename?", "declared_mime?" }
```

Respuesta `accepted` → **`scan_id`** + extraction + phash + view_url.  
`rejected` → HTTP 200 + reason.  
`failed` → HTTP 502 + step (`clamav`, `sanitize`, `forensic`).

CRM/PAM **no re-suben** el archivo: pasan `scan_id` a PAM `register_deposit`.

## Gate local

```powershell
npm run typecheck && npm run build
npm run dev
node scripts/smoke.mjs http://localhost:4100
```

Docker: `docker compose --env-file "E:\credenciales\GATE\local.env" up --build`

## Diagnóstico rápido

| Síntoma | Mirar |
|---------|-------|
| 502 `failed:clamav` | ClamAV sidecar caído; gate-test LIVE suele tener esto |
| 502 `failed:forensic` | Créditos Anthropic; `ANTHROPIC_API_KEY` |
| 401 Bearer | Token CRM/PAM ≠ `RECEIPT_GATE_TOKENS` |
| Timeout desde CRM prod | Firewall SG: allowlist `3.212.43.206` → gate prod |
| `duplicate` en re-test | Post-#220 GATE solo rechaza **sha256 EXACTO** por subject (reenvío literal). Similitud pHash **no bloquea** (log `gate_phash_similar`). Dedup por monto/fecha/COELSA/código = **PAM**. Wipe GATE si hace falta limpiar sha: `08` §9 · `npm run wipe:uat -- --full --yes` |
| Reuso cross-user no marcado | Señal **no bloqueante** `duplicate_global` (#258): `seen`/`via`(sha256\|phash_content)/`cross_user`/`first_scan_id`/`match_fields`. GATE emite, **PAM aplica** el rechazo cross-user. pHash+contenido (coelsa o monto+fecha+receptor) evita el falso positivo del mismo banco. Test `npm run test:global-dedup`. |
| ClamAV caído / host colgado prod | `10` §7.2 · `bash scripts/fix-gate-prod-recover.sh` · si SSH timeout → reboot EC2 · watchdog: `install-gate-clamav-watch.sh` |

## Wipe UAT (ops prod)

```bash
# prod: SSH directo con E:\credenciales\GATE\keys\GateAI.pem (~/gate NO es git repo → deploy por tarball)
ssh -i GateAI.pem ec2-user@3.12.87.253
cd ~/gate
docker compose exec gate node dist/ops/wipe-uat-dedup-cli.js --full --yes
docker compose restart gate
```

Parcial: `--subject-id <lead-uuid> --yes`. Preview sin `--yes`.

Keys Anthropic: https://console.anthropic.com/settings/keys

## Cambios de alto riesgo

- `src/gate/helpers.ts` (poppler/sharp) → sandbox G5 pendiente
- Tokens / `RECEIPT_VIEW_SECRET` → alinear CRM + PAM vault
- `docker-compose.yml` ClamAV fail-closed

## Antes de PR

```powershell
npm run typecheck
npm run build
node scripts/smoke.mjs http://localhost:4100
```

Seguir `AGENTS.md`. No commitear `.env`.

## Comunicación a CRM/PAM (R1)

```
=== MENSAJE INTER-INSTANCIA ===
DE: GATE   →   A: <CRM|PAM>
TIPO: <PEDIDO|RESPUESTA|AVISO>
MODULO: <ej. /scan response>
CONTEXTO: <qué cambió>
CONTRATO AFECTADO: <endpoint/payload/env>
ACCION REQUERIDA: <qué debe hacer>
REFERENCIAS: docs/05_INTEGRACION_CRM_PAM.md §x
RESPONDER: sí · a GATE · copy-paste
=== FIN ===
```

## Resumen ejecutivo (R6)

Terminar cada respuesta con: qué se hizo · estado · archivos · registrado en · próximo paso · bloque R1 pendiente.
