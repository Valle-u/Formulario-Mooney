# Vitácora — Deploy PROD + Cutover scan_id (GATE × CRM × PAM)

> Bitácora de la puesta en producción del GATE y la integración end-to-end
> comprobante → GATE → CRM → PAM (solicitud). Última actualización: **2026-07-02**.
>
> **Sin secretos acá** (convención `07_CREDENCIALES.md`): los tokens viven en el vault
> `Desktop\credenciales\`. Este doc guarda hosts, IPs, IDs y estado — no valores sensibles.

---

## 0. Handoff — continuar desde otra instancia (PTM)

| Qué | Dónde |
|-----|-------|
| **Repo** | `C:\Users\lauta\Desktop\Programa Comprobantes` (GATE) · rama `main` |
| **Índice** | `docs/README.md` |
| **Punto actual** | `docs/ESTADO.md` — integración prod **cerrada** |
| **Vitácora integración** | este doc (`10_DEPLOY_Y_CUTOVER.md`) §7 + §11 |
| **Contrato scan_id** | `docs/05_INTEGRACION_CRM_PAM.md` |
| **Vault secretos** | `Desktop\credenciales\` · ver `docs/07_CREDENCIALES.md` |
| **Repos hermanos** | CRM `MartinLope369/CRM` · PAM Black Dragon |

### Acceso SSH (desde dev PC `73.198.107.63`)

| Alias | Host | Key | Estado |
|-------|------|-----|--------|
| gate-prod | `3.12.87.253` | `GateAI.pem` | ✅ |
| gate-test | `18.225.198.243` | key `Gate` (no PEM vault) | Instance Connect |
| crm-prod | `3.212.43.206` | `SenderIO.pem` | ✅ |

### Estado integración (2026-07-02)

- **TEST:** E2E scan_id ✅ (`dep_163`, gate-test).
- **PROD:** E2E completo ✅ · **acta integración cerrada** (`dep_146`) · **UAT tester** · wipe dedup GATE full (2026-07-02).
- **GATE backlog:** G5 sandbox parsers · créditos Anthropic · no smokes gate-test contra CRM prod durante UAT.
- **Ops UAT:** `docs/08_RUNBOOK.md` §9 · `npm run wipe:uat` · reiniciar contenedor post-wipe (rate-limits memoria).

---

- **GATE prod:** ✅ desplegado y con HTTPS en `https://gate.megamooneymaker.com`.
- **GATE test:** ✅ `https://gate-test.megamooneymaker.com` (host separado).
- **CRM code:** ✅ contrato **scan_id mergeado a main** (PR **#8**). Repo canónico = `MartinLope369/CRM`.
- **CRM prod** (`crm.blackkdragon.work`): ✅ **ya desplegado** — `main @ a63fc61` (código scan_id activo), `.env` → `RECEIPT_GATE_URL=gate-test`. `gateRemoto.ok:true`.
- **PAM:** hosteado, conectado al CRM (según DEV, `PAM_CLIENT=http`). Su webhook ya acepta `scan_id`.
- **Objetivo actual:** levantar ClamAV en gate-test → CRM `.env` → smoke E2E TEST → cutover prod.
- **Bloqueante #1 → ✅ RESUELTO (2026-07-01):** el PAM reportó un token de gate-test que da `/stats` **200**
  (`63d651d6…`, en vault `GATE/test.env`). El gate valida `RECEIPT_GATE_TOKENS` como **lista plana**
  (`server.ts::tokenValido`) → cualquier token de la lista autentica **todo**, sin distinción de rol.
  ⇒ el CRM **reusa ese mismo token**; no hace falta rotar ni esperar al dev.
- **Bloqueante #2 → ✅ dato en mano:** el PAM dio la URL del PAM test = `https://test.megamooneymaker.com`
  (hoy el CRM tiene `PAM_URL=https://megamooneymaker.com` = PROD). Hay que cambiarlo al de test **antes del smoke**
  (si no, crea solicitud real y además desalinea el gate). `store_slug` test = `adminmegamooney-mqs5sgx7`.
- **Riesgo abierto:** ¿gate-test LIVE tiene créditos Anthropic para el OCR forense? (en prod/local hubo fallos por
  créditos agotados). Si el paso forense falla, `POST /scan` puede devolver `failed`.
- **Bloqueante #3 (2026-07-01 noche):** ClamAV caído en gate-test LIVE → `POST /scan` **502**
  `{ status:"failed", step:"clamav", error:"connect ECONNREFUSED 172.18.0.2:3310" }`.
  `/health`: `clamav.enabled:true`, `clamav.ok:false`. Sin `/scan accepted` no hay `scan_id` → E2E bloqueado.
  **Fix preferido:** levantar sidecar `clamav` en el host gate-test. **Workaround smoke:** deshabilitar ClamAV
  (requiere override en `docker-compose.yml` — el flag está hardcodeado `"true"` en el YAML, no basta `.env` solo).

---

## 2. GATE en producción

| Campo | Valor |
|-------|-------|
| Instancia EC2 | **GateAI** — `i-0f8428f7b82c2e75a` |
| IP pública | `3.12.87.253` |
| Región | `us-east-2` (Ohio) |
| Subnet | `subnet-0cb66dde1b28cb5b7` |
| Dominio | `gate.megamooneymaker.com` (A → 3.12.87.253) |
| TLS | Let's Encrypt (certbot), vence **2026-09-28**, auto-renew activo |
| Reverse proxy | nginx `:80`/`:443` → `127.0.0.1:4100` |
| Stack | docker compose: `receipt-gate` + `clamav` (red `receipt-net`) |
| SSH | key `Desktop\GateAI.pem`, user `ec2-user` |
| Código | `~/gate` (tarball desde git `main`) |
| Health | `/health` → `ok:true`, ClamAV OK, IA configurada, poppler OK |
| Tokens | vault `Desktop\credenciales\receipt-gate-prod.env` (CRM=token[0], PAM=token[1]) |

### Security Group del GATE prod — `launch-wizard-4` / `sg-0b9abb8d6c9927f4b`

| Puerto | Origen | Para qué |
|--------|--------|----------|
| 22 SSH | (según config) | administración |
| 80 HTTP | `0.0.0.0/0` | certbot / redirect a HTTPS |
| 443 HTTPS | `3.15.65.122/32` | **PAM** prod (MegaMM) |
| 443 HTTPS | `73.198.107.63/32` | PC del dev (pruebas) |
| 443 HTTPS | ✅ `3.212.43.206/32` | **CRM** prod (cutover — abierto 2026-07-02, desc `CRM prod cutover`) |

> **Nota firewall:** `gate.megamooneymaker.com` solo responde a IPs whitelisteadas en 443.
> CRM prod verificado 2026-07-02: EC2 `3.212.43.206` → `/health` 200 + `clamav.ok:true`.
> Cuidado con el campo **Descripción** de las reglas: AWS rechaza tildes/apóstrofos.

### GATE test (LIVE — distinto del gate-test interno viejo)

| Campo | Valor |
|-------|-------|
| Dominio | `gate-test.megamooneymaker.com` |
| Host | `18.225.198.243` (referencia PAM; desde desktop a veces timeout) |
| Reachability | `/health` 200 desde CRM (`3.212.43.206`) y PAM (`3.15.65.122`) ✅ |
| Auth | Lista `RECEIPT_GATE_TOKENS` **propia** del deploy LIVE (≠ vault interno `ba0c`/`be3b`) |
| Token vivo confirmado | `63d651d6…` — `/stats` **200** (reportado por PAM test, 2026-07-01) |
| ClamAV (2026-07-01) | ❌ **caído** — `ECONNREFUSED 172.18.0.2:3310` → `/scan` 502 `failed:clamav` |
| SSH ops | ❌ puerto **22 timeout** desde dev PC (`73.198.107.63`) y desde CRM/PAM — SG sin SSH abierto. Fix: abrir 22 en SG de esta instancia **o** EC2 Instance Connect en consola AWS. Script: `scripts/fix-gate-test-clamav.sh` |
| Convención doc | CRM=token[0], PAM=token[2]º del CSV — **pero el gate valida lista plana** (`tokenValido` en `server.ts`): cualquier token de la lista autentica **todos** los endpoints. El CRM **reusa** el del PAM. |
| Vault | token vivo anotado en `Desktop\credenciales\GATE\test.env` (sección A). El archivo histórico (sección B) es el gate interno docker co-ubicado, **no** el live. |
| Riesgo | Créditos Anthropic/OCR forense en gate-test LIVE — sin confirmar (en prod/local hubo `failed` por créditos agotados). |

---

## 3. CRM en producción — `crm.blackkdragon.work`

> Auditoría 2026-07-01 (solo lectura). Es un deploy "prod-hosteado" pero **cableado a TEST**.

| Campo | Valor |
|-------|-------|
| Host | `crm.blackkdragon.work` → `3.212.43.206` (Amazon Linux, `ec2-user`) |
| Repo | `/home/ec2-user/CRM` |
| Rama/commit | `main @ a63fc61` ✅ (scan_id activo, al día con GitHub; nunca estuvo en `f3145c1`) |
| Proceso | PM2 `crm-backend` = `npx tsx src/index.ts` (⚠️ **sin build**, cambios en disco quedan vivos) |
| Panel | PM2 `crm-panel` = `npm run dev --host` |
| nginx | `:443` (Let's Encrypt) → `127.0.0.1:3001`, SSE/WS habilitado |
| Node | v24.18.0 (nvm) |
| Update | `git pull origin main` → `pm2 restart crm-backend` → `pm2 save` (no hay script formal) |

### Config `.env` prod del CRM (relevante)

| Variable | Valor | Nota |
|----------|-------|------|
| `NODE_ENV` | `development` | |
| `PAM_CLIENT` | `http` | ✅ PAM real |
| `PAM_URL` | `https://megamooneymaker.com` | ❌ **PAM PROD** — cambiar a PAM test antes del smoke (Bloqueante #2) |
| `PAYBOT_SECRET` | seteado (~78 chars) | debe == `PAYBOT_WEBHOOK_SECRET` del PAM |
| `RECEIPT_GATE_CLIENT` | `http` | ✅ |
| `RECEIPT_GATE_URL` | `https://gate-test.megamooneymaker.com` | ✅ TEST (mismo gate que el PAM) |
| `RECEIPT_GATE_TOKEN` | `f48Gb…` (prod) → **cambiar a** `63d651d6…` | ✅ ese token da 200 en gate-test (vault `GATE/test.env`) |
| `PAM_RECEIPT_TRANSITION_BASE64` | `false` | solo scan_id, sin fallback base64 |

### Remotos del CRM (reconfigurados 2026-07-01)

| Remote | URL | Rol | `main` HEAD |
|--------|-----|-----|-------------|
| `origin` | `github.com/MartinLope369/CRM` | **canónico** | `a63fc61` |
| `host` | `github.com/unidadmentemaestra-web/CRM` | upstream | `296b66d` |

Ambos tienen el scan_id (#8 `33df8fe`). `origin` va 2 commits adelante (`dd8adf2` sync con prod
+ `6c348ad` doc repo canónico). **Prod debe tirar de `origin` (MartinLope369).**

### Contrato del CRM — scan_id ✅ (main nuevo, ya mergeado #8)

`main` (nuevo) manda al PAM el contrato v2:

```
pam.registerDeposit({ telefono, username, bonus_type, store_slug,
  client_op_id: op.id, scan_id, es_primera_carga, receipt_channel,
  ...(fallback dev: { receipt_base64, phash }) })
```

Fail-closed: sin `scan_id` no hay solicitud. El CRM **prod ya corre este contrato** (`main @ a63fc61`).

---

## 4. PAM (Black Dragon)

### PAM test — verificado 2026-07-01 (respuesta instancia PAM)

| Campo | Valor |
|-------|-------|
| Host | casinodragon-test · EC2 `3.15.65.122` · `:3001` |
| URL (CRM debe usar) | `https://test.megamooneymaker.com` |
| `RECEIPT_GATE_URL` | `https://gate-test.megamooneymaker.com` ✅ (mismo gate que CRM) |
| `RECEIPT_GATE_TOKEN` | `63d651d6…` → `/stats` **200** ✅ |
| Portal test | `store_slug=adminmegamooney-mqs5sgx7` |

### Contrato PAM (scan_id v2)

- Webhook: `POST /api/webhook/paybot`, header `X-Paybot-Secret` == `PAYBOT_WEBHOOK_SECRET`
  (⚠️ default inseguro `paybot-dragon-secret-2026` si la env queda vacía).
- `handleRegisterDeposit` (`src/lib/paybot/actions.ts`) ya soporta el contrato v2:
  - exige `scan_id` **o** `receipt_base64`;
  - con `scan_id` baja la imagen del gate (`fetchReceiptImage` → `GET /receipts/:id`, Bearer) y
    persiste `receipt_scan_id`; luego `processDepositWithAI` (lee extracción por `scan_id`, sin re-OCR);
  - `client_op_id` = idempotencia; fail-closed si el gate no responde.
- Consume el gate vía `RECEIPT_GATE_URL` + `RECEIPT_GATE_TOKEN` (`src/lib/receipt-gate.ts`).

### Alineación E2E (estado objetivo TEST)

```
CRM prod (3.212.43.206)          gate-test LIVE              PAM test (3.15.65.122)
─────────────────────────        ─────────────────           ──────────────────────
RECEIPT_GATE_URL ──────────────► gate-test.megamooneymaker.com ◄──── RECEIPT_GATE_URL
RECEIPT_GATE_TOKEN → 63d651…     (mismo gate, mismo token)         RECEIPT_GATE_TOKEN → 63d651…
PAM_URL ────────────────────────────────────────────────────────► test.megamooneymaker.com
         register_deposit(scan_id) ─────────────────────────────► solicitud + /pam/events
```

⚠️ Hoy el CRM tiene `PAM_URL=https://megamooneymaker.com` (**PROD**) — **pendiente cambiar** antes del smoke.

---

## 5. Cutover scan_id — plan y decisiones

**Objetivo:** que el comprobante cargado por el CRM llegue al PAM con la **data completa**
(referencia `scan_id` + identidad) y quede como **solicitud** lista para matcheo.

**Decisiones:**
- **TEST primero** (gate-test + PAM test, ya alcanzables). Cutover a prod después.

### Port scan_id — ✅ HECHO (mergeado a main como PR #8)

Se mergeó la integración scan_id-céntrica completa (rama `feat/receipt-gate/crm-http-only` →
`main`, PR #8 `33df8fe`). Estado del código en `main`:

- `receipt-gate/client.ts` + `scan.ts` presentes; gate local embebido **eliminado**
  (`clamav.ts`/`helpers.ts`/`receipt-gate.ts` ya no están).
- `brain.ts` `registerDeposit` manda `scan_id` + `client_op_id: op.id` + `es_primera_carga` +
  `receipt_channel`; fail-closed sin `scan_id`.
- Incluye endurecimiento Capa 1 (auditoría F1–F14: MIME real, doble rate-limit, F11 idempotencia, etc.).

> Ya **no** queda trabajo de código en el CRM. Lo que falta es **config `.env` + smoke E2E**.

---

## 6. Secuencia (checklist)

- [x] **Usuario:** commit + push de los cambios vivos de prod del CRM (reconciliados en main, sync `dd8adf2`).
- [x] **CRM code:** contrato scan_id mergeado a `main` (PR #8 `33df8fe`). Repo canónico `MartinLope369/CRM`.
- [x] **CRM instance:** deploy — `main @ a63fc61` (client.ts/scan.ts presentes, gate local ausente). `gateRemoto.ok:true`.
- [x] **Token gate-test:** resuelto — PAM aportó `63d651d6…` (`/stats` 200). Gate = lista plana → CRM reusa ese token. **No hace falta rotar ni esperar al dev.**
- [x] **PAM test:** confirmado — mismo gate, token 200, URL `https://test.megamooneymaker.com`, `store_slug=adminmegamooney-mqs5sgx7`.
- [x] **Gate-test ClamAV (BLOQUEANTE #3 — RESUELTO 2026-07-02):** el sidecar `clamav` estaba **Up pero unhealthy**
  (clamd colgado en recarga de base → `ECONNREFUSED :3310`). Fix aplicado vía **EC2 Instance Connect** (instancia `Gate`
  `i-06ed93a8f7cab7526`, key pair `Gate` — no `GateAI`): `docker compose restart clamav` + `restart gate`.
  `/health` → `clamav.ok:true` (`checkedAt` 02:58Z). Compose vive en `~/receipt-gate`.
- [x] **CRM `.env` + restart (2026-07-02):** token `63d651d6…` + `PAM_URL=https://test.megamooneymaker.com` + `PAM_RECEIPT_TRANSITION_BASE64=false` + `PAYBOT_SECRET` OK; `pm2 restart --update-env` aplicado (online). CRM confirmó vía su EC2 `gate-test/health` → `clamav.ok:false` (`ECONNREFUSED 172.18.0.2:3310`). **Espera señal `clamav.ok:true` de GATE.** (MSG-E2E-01)
- [x] **Smoke E2E scan_id (2026-07-02):** comprobante real → POST /scan accepted →
  `scan_id=7499e96c-a316-4fdf-97e9-fc25f19e0c4d` → register_deposit OK (`dep_163`) →
  `deposit.created` CRM ✅ · GET /receipts Bearer ✅ · sin re-OCR ✅.
  **Integración CRM→GATE→PAM CERRADA.** `deposit.accepted` NO por regla PAM (`COMPROBANTE_VIEJO` >48h → manual_review).
- [ ] **Confirmar créditos Anthropic en gate-test** (riesgo posterior: `POST /scan` → `failed` en paso forense).
- [x] **Cutover PROD (fase 2 — CERRADO 2026-07-02):** E2E prod completo **`dep_146`** · webhook PAM OK · eventos CRM 200.

---

## 11. Cutover PROD fase 2 — runbook (TEST se mantiene)

> **Principio:** levantar **prod** (CRM+PAM+GATE prod alineados). **TEST intacto** en sus hosts
> (`gate-test`, `test.megamooneymaker.com`) — no tocar esos `.env` salvo rollback manual.

### Dominios

| Rol | PROD (objetivo) | TEST (se mantiene) |
|-----|-----------------|-------------------|
| GATE | `https://gate.megamooneymaker.com` | `https://gate-test.megamooneymaker.com` |
| PAM | `https://megamooneymaker.com` | `https://test.megamooneymaker.com` |
| CRM | `https://crm.blackkdragon.work` | mismo host; `.env` define prod vs test |
| Portal slug | `megamooneymaker-mqs68zwz` | `adminmegamooney-mqs5sgx7` |

### Orden de ejecución (ventana única)

| # | Quién | Acción |
|---|-------|--------|
| 1 | **GATE** | ✅ SG gate prod `sg-0b9abb8d6c9927f4b`: inbound 443 ← `3.212.43.206/32` (CRM). PAM `3.15.65.122/32` ya estaba. |
| 2 | **GATE** | ✅ Verificado desde CRM EC2 (2026-07-02): `/health` 200 + `clamav.ok:true`. |
| 3 | **GATE** | (Opcional) SSH gate prod `3.12.87.253`: `cd ~/gate && git pull && docker compose up -d --build`. |
| 4 | **PAM** | ✅ **Ya alineado (2026-07-01 + verificado 2026-07-02):** `RECEIPT_GATE_URL=https://gate.megamooneymaker.com`, token prod OK, `/health` gate 200, `clamav.ok:true`. Sin rebuild. |
| 5 | **CRM** | ✅ Cutover prod aplicado (2026-07-02, resp. MSG-CUTOVER-PROD-01): `.env` prod + backup + `pm2 restart --update-env`. EC2 → gate `/health`+`/stats` 200. |
| 6 | **CRM** | ✅ Smoke E2E prod (2026-07-02): gate prod OK · PAM lookup 200 · `register_deposit` **`dep_143`** · lead `cs_standby` / `en_verificacion`. |
| 7 | **GATE** | ✅ Vitácora cerrada §7 (PAM confirma E2E prod `dep_146`). |

### Inter-instancia (2026-07-02)

| Ref | De → A | Estado |
|-----|--------|--------|
| MSG-CUTOVER-PROD-01 | GATE → CRM | ✅ **respondido** — cutover `.env` prod aplicado EC2 |
| (cutover PROD firewall) | GATE → PAM | ✅ PAM respondió: ya alineado desde 2026-07-01, sin acción |
| MSG-E2E-01 | GATE ↔ CRM | ✅ TEST cerrado (`dep_163`) |
| Smoke E2E prod | CRM+PAM | ✅ **`dep_146`** E2E completo · webhook OK (2026-07-02) |

### Verificación GATE prod (2026-07-02)

- Dev PC → `/health` ✅ (`clamav.ok:true`, `ai_configured:true`)
- SSH loopback gate prod ✅
- CRM EC2 `3.212.43.206` → gate prod ✅ (2026-07-02, post-regla SG + post-cutover CRM)
- CRM EC2 → gate prod `/stats` Bearer token CRM prod ✅ (2026-07-02)
- PAM prod `3.15.65.122` → gate prod `/health` ✅ (2026-07-02, ya alineado desde 2026-07-01)

### Rollback a TEST (CRM/PAM prod `.env`)

| Variable | Valor TEST (rollback) |
|----------|----------------------|
| `RECEIPT_GATE_URL` | `https://gate-test.megamooneymaker.com` |
| `RECEIPT_GATE_TOKEN` | vault `GATE/test.env` |
| `PAM_URL` | `https://test.megamooneymaker.com` |
| `PAM_STORE_SLUG` | `adminmegamooney-mqs5sgx7` |

Secretos: `Desktop\credenciales\GATE\prod.env`, `CRM\prod.env` — ver `07_CREDENCIALES.md`.

> **⚠️ Restricción scan_id:** CRM y PAM deben apuntar al **mismo gate** (el `scan_id` es específico
> del gate que lo emitió). No sirve CRM→gate-A + PAM→gate-B.
>
> **Opciones evaluadas para desbloquear el E2E:**
> - **(A) gate-test — ELEGIDA:** usar el token live de gate-test (del dev, o **reusar el del PAM** si ya autentica). Mantiene test aislado, sin tocar prod ni firewall.
> - **(B) prod gate — descartada por ahora:** apuntar CRM **y** PAM-test a `gate.megamooneymaker.com` (tokens prod conocidos: CRM `f48Gb`, PAM `mPu0dxht`). Requeriría whitelistear la IP del CRM (`3.212.43.206`) en el SG del gate prod 443.

---

## 7. Prompts enviados a otras instancias (referencia)

- **CRM (deploy/audit — 2026-07-01):** auditoría solo-lectura. Resultado: `main @ a63fc61`, scan_id activo, token prod 401 en gate-test. §3.
- **PAM (reporte v2 — 2026-07-01):** ✅ **respondido.** Gate-test URL+token (`63d651d6…`, `/stats` 200), PAM test URL (`test.megamooneymaker.com`), `store_slug=adminmegamooney-mqs5sgx7`. §4.
- **PAM (standby E2E — 2026-07-02, MSG-E2E-02):** ✅ alineado con gate-test (`RECEIPT_GATE_URL`+token OK). `PAYBOT_WEBHOOK_SECRET` **set, 64 chars**, no default inseguro.
- **PAM (reporte post-smoke — 2026-07-02 ~03:05Z, resp. MSG-E2E-02):** smoke **NO** completó la cadena. `register_deposit(scan_id)` **no llegó** a PAM (sin fila `payment_requests`). Tráfico CRM→PAM observado (IP `3.212.43.206`):
  - `lookup_user_by_phone` → **200** → **✅ PAYBOT_SECRET CRM↔PAM ALINEADO** (prefijo `428a69…`). Cross-check 78-vs-64 **descartado/resuelto**.
  - `create_user` → **404 store_not_found**: CRM usó `store_slug=megamooneymaker-mqs68zwz` (**PROD**); PAM test activo = `adminmegamooney-mqs5sgx7`.
  - **Causa raíz:** el smoke se corta **en CRM** (store_slug prod → sin usuario → sin `register_deposit`). Gate y PAM OK; nunca se ejecutó `/scan` real ni `fetchReceiptImage`. Es el pendiente **MSG-E2E-USER-001** con causa precisa (slug, no solo usuario).
  - **Acción CRM (cuando responda):** usar portal/store_slug test `adminmegamooney-mqs5sgx7` en el smoke + crear usuario test → reintentar.
- **CRM (reporte post-smoke — 2026-07-02 ~03:03Z, resp. MSG-E2E-01):** confirmó GATE OK: `/health clamav.ok:true`, `POST /scan` alcanzable (probe JPEG mínimo → `rejected: too_small`, esperado; sin 502/forensic). Smoke E2E **incompleto, bloqueo NO-GATE**. Secuencia cruzada con PAM:
  1. `lookup_user_by_phone` (+5491165272831) → 200 pero `usuario_por_defecto: null` (sin username).
  2. `create_user` → PAM **404 store_not_found** por `store_slug=megamooneymaker-mqs68zwz` (**PROD**) en vez de test `adminmegamooney-mqs5sgx7`.
  3. Lead queda `welcome_pendiente` → no entra flujo CS depósito → **CRM nunca llama `POST /scan`** → sin scan_id/register_deposit.
  - **Doble fix requerido:** (a) **CRM** → smoke con `store_slug=adminmegamooney-mqs5sgx7`; (b) **PAM** → usuario test válido en ese portal (lookup con username real / `create_user` OK). Junta MSG-E2E-USER-001.
  - **GATE:** parte cerrada — `MSG-E2E-CLAMAV-001` resuelto, gate-test UP. Rol GATE ahora = mantener gate-test arriba y coordinar reintento.
- **CRM (fix aplicado — 2026-07-02, resp. MSG-E2E-01):** ✅ `PAM_STORE_SLUG` corregido en `.env` prod (`megamooneymaker-mqs68zwz` → `adminmegamooney-mqs5sgx7`) + `pm2 restart --update-env` + `pm2 save`. (Nota CRM: el script smoke ya usaba `SMOKE_SLUG` test vía widget; el desalineado era `PAM_STORE_SLUG` del probe/panel.) `PAM_EVENTS_SIGNING_SECRET` presente. Backup `.env.bak.pam-store-test`. **CRM en standby para reintento.**
  - **Camino crítico restante:** (1) ~~MSG-E2E-USER-001~~ ✅ **RESUELTO (2026-07-02)** — PAM provisionó `crmtest65272831` / `+5491165272831`, lookup no-nulo, `create_user` OK; (2) **MSG-E2E-EVENTS-001** reconfig `crm_api_keys` → `/pam/events` (PAM) — riesgo residual para `deposit.accepted` en CRM. **GATE dispara reintento smoke a CRM.**
- **PAM (MSG-E2E-USER-001 — 2026-07-02):** ✅ usuario test en portal `adminmegamooney-mqs5sgx7`: tel `+5491165272831`, username `crmtest65272831`, store_id=3. `lookup_user_by_phone` → `usuario_por_defecto=crmtest65272831` (no-nulo). `create_user` desde CRM probado OK (201). PAM standby ON.
- **PAM (reporte parcial smoke — 2026-07-02 ~03:28Z):** smoke en curso; **bloqueo NO-GATE, NO-PAM**. PAM recibió **2× register_deposit sin scan_id** (03:14Z, 03:24Z) → HTTP 400 (tel ajenos al smoke test). **CRM audit (2026-07-02):** esos teléfonos **no** aparecen en logs cerebro prod → probable probe externo (no brain EC2). Usuario test: lookup OK; POST /scan **rejected** (fixtures sintéticos too_small/not_a_receipt) → sin scan_id → register_deposit no invocado (fail-closed CRM correcto). **Próximo paso:** livechat manual con comprobante real.
- **CRM (audit cerebro + smoke — 2026-07-02, resp. MSG-E2E-01):** ✅ `brain.ts` fail-closed verificado. Smoke headless no cierra E2E (forense rechaza sintéticos).
- **CRM (smoke E2E comprobante real — 2026-07-02):** ✅ **CADENA CERRADA CRM→GATE→PAM register_deposit(scan_id)**. Comprobante Banco Bica.jpg → POST /scan accepted → `scan_id=7499e96c-a316-4fdf-97e9-fc25f19e0c4d` → register_deposit OK (`dep_163`) → `deposit.created` CRM ✅. Sin 401/502 gate.
- **PAM (verificación dep_163 — 2026-07-02):** ✅ register_deposit(scan_id) 200 · GET /receipts Bearer OK · sin re-OCR · deposit.created CRM 200 (test). `deposit.accepted` NO: `COMPROBANTE_VIEJO` → manual_review.
- **PAM (cutover PROD — 2026-07-02):** ✅ prod EC2 `3.15.65.122` ya apuntaba a `gate.megamooneymaker.com` desde deploy 2026-07-01. Verificado post-firewall: token prod OK, gate `/health` 200, `clamav.ok:true`. **Sin acción PAM pendiente.**
- **GATE → CRM (MSG-CUTOVER-PROD-01 — 2026-07-02):** ⏳ enviado — cutover prod pedido.
- **CRM → GATE (resp. MSG-CUTOVER-PROD-01 — 2026-07-02):** ✅ cutover prod `.env` aplicado EC2 `3.212.43.206`. Backup `.env.bak.cutover-prod-*`. `pm2 restart --update-env` + `pm2 save`. Verificado: gate prod `/health` 200 + `/stats` Bearer 200.
- **CRM → GATE/PAM (smoke E2E prod — 2026-07-02, paso 6 §11):** ✅ gate prod OK · `register_deposit` **`dep_143`** · lead `cs_standby` / `en_verificacion`.
- **PAM → CRM/GATE (verificación dep_143 — 2026-07-02):** ✅ scan_id gate prod · GET /receipts OK. Primer `deposit.created` 04:09Z → legacy Vercel **401** (pre-webhook). Post-fix: re-emit **200** (04:26Z). Panel dep_143: `pendiente`/`rejected` (archivo no encontrado; 2º register sobrescribió DB).
- **PAM → GATE (cierre vitácora cutover — 2026-07-02):** ✅ Webhook prod · **`dep_146`** E2E completo · eventos CRM 200. Ver entrada detallada arriba.
- **PAM → GATE (acta E2E integración cerrada — 2026-07-02):** ✅ Gate prod operativo · CRM cutover prod confirmado · PAM consume gate prod · eventos `pam/events` · smoke ref accept **`dep_146`** (`scan_id=7d5b0d0a-…`). **UAT tester habilitado.** Pendiente GATE: **ninguno bloqueante.** Smoke negocio limpio (&lt;48h + COELSA) = fase UAT (PAM/CRM).
- **CRM → GATE (aviso revert `.env` TEST — 2026-07-02):** scripts e2e-test CRM pisan `.env` prod en EC2. GATE audit: **no** cron/job automático; scripts legacy manuales `migrate-cutover.sh` / `configure-senderio-etapa2.sh` pueden sed CRM `.env` → gate-test. **GATE:** no ejecutarlos durante UAT.
- **CRM → GATE (PEDIDO reset dedup UAT prod — 2026-07-02):** ✅ script `wipe-uat-dedup-cli` + runbook `08` §9. **Wipe FULL** ejecutado gate prod: 25 phashes · 18 scans · 18 JPEGs · `docker compose restart gate`. Post-check: 0/0/0 · health OK. **Scope parcial:** `--subject-id <lead-uuid>`. COELSA dedup = PAM (fuera GATE).
- **Gate prod incidente ClamAV/host (2026-07-05):** update daily freshclam 21:14Z → clamd colgado → host degradado (TLS/SSH timeout) → **reboot EC2** + fix manual. Mitigación desplegada: **systemd watchdog** 5 min + **swap 2G** + compose `mem_limit` clamav. Runbook **`10` §7.2**.
- **Gate-test host (ClamAV — BLOQUEANTE #3):** runbook §7.1 — ejecutar en el EC2 gate-test.
- **CRM (apply + smoke — listo, bloqueado por ClamAV):** token + `PAM_URL` → smoke livechat. Runbook: CRM `docs/34_RUNBOOK_AGENTE_GATE_TEST_TOKEN.md`.
- **GATE dev (handoff — opcional):** solo si el smoke falla por OCR/créditos Anthropic. Doc: `11_HANDOFF_GATE_TEST_E2E.md`.

### 7.1 Runbook gate-test — ClamAV caído (ejecutar EN el host gate-test)

> **No es handoff externo** — correr en la shell del EC2 gate-test (`gate-test.megamooneymaker.com`).

**Síntoma:** `POST /scan` → 502 `{ step:"clamav", error:"connect ECONNREFUSED 172.18.0.2:3310" }`.

**Opción A — levantar ClamAV (recomendado):**

```bash
cd ~/receipt-gate || cd ~/gate    # donde esté el compose
docker compose ps
docker compose logs clamav --tail 80
docker compose up -d clamav
# Esperar ~2 min (freshclam). Repetir hasta clamav healthy:
docker compose ps
curl -s http://127.0.0.1:4100/health | jq '{ok, clamav}'
docker compose restart gate
curl -s http://127.0.0.1:4100/health | jq '{ok, clamav}'   # clamav.ok debe ser true
```

**Opción B — workaround temporal (solo smoke TEST; revertir después):**

```bash
cd ~/receipt-gate || cd ~/gate
# ⚠️ RECEIPT_CLAMAV_ENABLED está hardcodeado "true" en docker-compose.yml — .env solo no alcanza
sed -i 's/RECEIPT_CLAMAV_ENABLED: "true"/RECEIPT_CLAMAV_ENABLED: "false"/' docker-compose.yml
docker compose up -d gate
curl -s http://127.0.0.1:4100/health | jq '.clamav'   # enabled:false, ok:true
```

**Verificación:** `/health` con `clamav.ok:true` → avisar al CRM para reintentar smoke.

### 7.2 Runbook gate **prod** — ClamAV + host colgado (`3.12.87.253`)

> Mismo patrón que §7.1 pero en **GateAI** prod. Causa raíz: `freshclam` actualiza `daily.cld` → `clamd` se cuelga recargando firmas → sidecar **unhealthy** → fail-closed `/scan`. Sin swap puede degradar nginx/sshd (TCP OK, TLS/SSH timeout) → **reboot EC2**.

**Síntomas:**

| Nivel | Señal |
|-------|-------|
| ClamAV | `/health` → `clamav.ok:false` · `ECONNREFUSED 172.18.0.x:3310` |
| Host colgado | CRM timeout TLS · SSH banner timeout · TCP :443 SYN OK |

**Fix rápido (SSH disponible):**

```bash
cd ~/gate
bash scripts/fix-gate-prod-recover.sh
# o manual:
docker compose restart clamav   # esperar healthy ~30–120s
docker compose restart gate
curl -s http://127.0.0.1:4100/health   # 2ª llamada → clamav.ok:true (cache 30s)
```

**Host colgado (SSH no responde):** AWS Console us-east-2 → **GateAI** `i-0f8428f7b82c2e75a` → **Reboot instance** → luego fix arriba.

**Prevención (instalado prod 2026-07-05):**

```bash
cd ~/gate
bash scripts/install-gate-clamav-watch.sh   # systemd timer 5 min + swap 2G
```

- Watchdog: `gate-clamav-watch.timer` → `watch-clamav.sh` (restart clamav+gate si unhealthy)
- Swap: `/swapfile` 2G en fstab
- Compose: `mem_limit: 1536m` en sidecar clamav (tras redeploy tarball)

**Logs útiles:**

```bash
docker compose logs clamav --tail 80 | grep -E 'daily.cld updated|NOT notified|Reading databases|clamd started'
journalctl -u gate-clamav-watch.service --since today
```

**Vitácora 2026-07-05:** reboot EC2 + fix manual · post-mortem: update daily 21:14Z → clamd colgado ~2h → host degradado. Mitigación: timer + swap.

---

- Contrato canónico: `05_INTEGRACION_CRM_PAM.md` (v1 congelado).
- Migración de host del gate: `09_MIGRACION_GATE_HOST.md`.
- Credenciales/vault: `07_CREDENCIALES.md` + `Desktop\credenciales\` (INVENTARIO.md, GATE-PAM-PROD.txt).
- Runbook: `08_RUNBOOK.md`.
