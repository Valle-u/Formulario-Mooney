# Plan de migración — Gate a host dedicado

> **Estado actual (2026-06-29):** gate co-ubicado en casinodragon (`3.15.65.122`, us-east-2)
> junto al PAM test. CRM en SenderIO (`3.212.43.206`, us-east-1). Etapas 1 y 2 validadas.
>
> **Objetivo:** mover el Receipt Gate a un **EC2 sacrificable propio**, desacoplado del PAM y del CRM,
> alineado con `01_ARQUITECTURA.md`.

---

## 1. As-is vs to-be

### Hoy (test)

```text
┌─ SenderIO (us-east-1) ─────────────┐     HTTPS /receipt-gate
│  CRM :3001                          │ ──────────────────────────────┐
└─────────────────────────────────────┘                               │
                                                                      ▼
┌─ casinodragon (us-east-2) ─────────────────────────────────────────────┐
│  nginx test.megamooneymaker.com                                        │
│    /receipt-gate/ → 127.0.0.1:4100  (allow: CRM IP + localhost)      │
│  docker: receipt-gate + clamav  (:4100 loopback + red receipt-net)     │
│  docker: casinodragon-test (PAM)  → http://receipt-gate:4100          │
│  ~/casinodragon-test/data/casino.db                                    │
└────────────────────────────────────────────────────────────────────────┘
```

| Cliente | URL gate hoy | Canal verificado |
|---------|--------------|------------------|
| PAM panel | `http://receipt-gate:4100` (Docker interno) | `pam_panel` ✅ |
| CRM livechat | `https://test.megamooneymaker.com/receipt-gate` | `crm_livechat` ✅ |

### Objetivo (test → prod)

```text
┌─ SenderIO ──────┐          ┌─ casinodragon (solo PAM) ──┐
│  CRM            │──HTTPS──▶│  PAM (sin gate local)       │
└─────────────────┘    │     └────────────────────────────┘
                       │                    │
                       ▼                    ▼
              ┌─ gate-host (EC2 dedicado) ────────────────┐
              │  gate-test.megamooneymaker.com :443       │
              │  docker: receipt-gate + clamav            │
              │  SQLite + /data/receipts (solo dedup)     │
              │  SG: solo CRM IP + PAM IP (+ ops bastion) │
              └───────────────────────────────────────────┘
```

---

## 2. Decisiones a cerrar antes de empezar

| # | Decisión | Opciones | Recomendación test |
|---|----------|----------|-------------------|
| D1 | **Región del gate** | us-east-2 (cerca PAM) · us-east-1 (cerca CRM) | **us-east-2** — el panel PAM sube más comprobantes; CRM tolera +30 ms |
| D2 | **DNS** | Path `/receipt-gate` en PAM nginx · subdominio dedicado | **`gate-test.megamooneymaker.com`** — cert propio, nginx más simple |
| D3 | **Tamaño EC2** | t3.small (2 vCPU, 2 GB) · t3.medium | **t3.small** test; medium si forensic + ClamAV saturan |
| D4 | **Migrar datos SQLite** | Copiar volumen · empezar DB vacía | **Test:** DB vacía OK (pocos scans). **Prod:** copiar volumen + WAL checkpoint |
| D5 | **Tokens** | Reutilizar test · rotar al migrar | **Rotar** `RECEIPT_GATE_TOKENS` + `RECEIPT_VIEW_SECRET` en el corte |
| D6 | **PAM tras migración** | HTTPS al gate-host · túnel privado | **HTTPS** (mismo patrón que CRM; sin VPC cross-region) |
| D7 | **Ventana de corte** | Blue/green sin downtime · parada breve | **Blue/green:** nuevo host arriba → switch URLs → apagar viejo |

---

## 3. Fases de migración

### Fase 0 — Preparación (sin tocar prod test)

**Infra nueva**

1. Crear EC2 **gate-test** en us-east-2 (Amazon Linux 2023 o Ubuntu 22.04).
2. Security Group:
   - Inbound **443** desde `3.212.43.206/32` (CRM) y `3.15.65.122/32` (PAM).
   - Inbound **22** solo desde IP ops (bastion).
   - **No** abrir 4100 a internet.
   - Outbound: HTTPS (updates, Anthropic API), ClamAV mirrors — restringir resto cuando sea posible.
3. Elastic IP opcional (estable para DNS).
4. DNS: `gate-test.megamooneymaker.com` → A record al EIP.
5. Certificado: certbot nginx o ACM + ALB (ALB solo si querés terminar TLS ahí).

**Software en gate-host**

```bash
sudo dnf install -y docker git nginx   # o apt
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user

git clone https://github.com/MartinLope369/Programa-Comprobantes.git ~/receipt-gate
cd ~/receipt-gate
# .env desde vault (ver 07_CREDENCIALES.md) — valores NUEVOS para test migrado
docker compose --env-file .env up --build -d
curl -s http://127.0.0.1:4100/health   # ok + clamav ok
```

**`.env` del gate en host nuevo (plantilla)**

```env
NODE_ENV=production
PORT=4100
DB_PATH=/data/receipt-gate.db
RECEIPT_STORAGE_PATH=/data/receipts
RECEIPT_PUBLIC_URL=https://gate-test.megamooneymaker.com
RECEIPT_GATE_TOKENS=<token-crm-nuevo>,<token-pam-nuevo>
RECEIPT_VIEW_SECRET=<hex-nuevo-32b>
RECEIPT_FORENSIC_ENABLED=true
RECEIPT_FORENSIC_REQUIRED=auto
ANTHROPIC_API_KEY=<key>
ANTHROPIC_MODEL=claude-haiku-4-5
RECEIPT_CLAMAV_ENABLED=true
RECEIPT_CLAMAV_FAIL_CLOSED=true
```

**Nginx en gate-host**

```nginx
# /etc/nginx/conf.d/gate-test.conf
server {
    listen 443 ssl http2;
    server_name gate-test.megamooneymaker.com;

    ssl_certificate     /etc/letsencrypt/live/gate-test.megamooneymaker.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gate-test.megamooneymaker.com/privkey.pem;

    client_max_body_size 12M;

    location / {
        allow 3.212.43.206;   # CRM SenderIO
        allow 3.15.65.122;    # PAM casinodragon (hasta que PAM también migre URL)
        deny all;

        proxy_pass http://127.0.0.1:4100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

**Validación Fase 0 (gate aislado, sin clientes)**

```bash
# Desde casinodragon o SenderIO (IPs allowlisted):
TOKEN=<token-crm-nuevo>
curl -s https://gate-test.megamooneymaker.com/health
node scripts/smoke.mjs https://gate-test.megamooneymaker.com $TOKEN
```

---

### Fase 1 — Paralelo (blue/green)

Nuevo gate arriba; clientes **siguen** apuntando al viejo en casinodragon.

| Check | Comando / acción |
|-------|------------------|
| Health nuevo | `curl health` → `ok:true`, `clamav.ok:true` |
| Smoke | `smoke.mjs` → 5 ok |
| Scan manual | `POST /scan` channel `crm_livechat` → scan en SQLite nuevo |
| view_url | Abrir `view_url` del response → JPEG |
| Latencia | Comparar `responseTime` PAM vs CRM al nuevo host |

Opcional — **copiar datos** del gate viejo (si querés conservar scans test):

```bash
# En casinodragon (gate viejo):
docker compose -f ~/receipt-gate/docker-compose.yml stop gate
docker run --rm -v receipt-gate_gate-data:/from -v /tmp:/to alpine \
  sh -c "cd /from && tar czf /to/gate-data.tgz ."

# Copiar gate-data.tgz al gate-host (scp)
# En gate-host:
docker compose stop gate
sudo tar xzf gate-data.tgz -C /var/lib/docker/volumes/receipt-gate_gate-data/_data/
docker compose start gate
```

> Si la DB tiene WAL activo, parar el contenedor antes del tar. En test con 3 scans, más simple empezar vacío.

---

### Fase 2 — Corte (switch clientes)

**Orden recomendado:** CRM → PAM → nginx viejo → apagar gate en casinodragon.

#### 2.1 CRM (SenderIO)

```bash
# ~/CRM/app/backend/.env
RECEIPT_GATE_URL=https://gate-test.megamooneymaker.com
RECEIPT_GATE_TOKEN=<token-crm-nuevo>   # 1º de RECEIPT_GATE_TOKENS del gate nuevo

pm2 restart crm-backend --update-env
```

Validar: livechat → 📎 → scan `crm_livechat` en **SQLite del gate-host** (no casinodragon).

#### 2.2 PAM (casinodragon)

```bash
# ~/casinodragon-test/.env (o el .env que use deploy-test.sh)
RECEIPT_GATE_URL=https://gate-test.megamooneymaker.com
RECEIPT_GATE_TOKEN=<token-pam-nuevo>   # 2º token

bash ~/deploy-test.sh <rama-pam-activa>
# Ya NO hace falta receipt-net para el PAM → gate (HTTPS externo)
```

Validar: subir comprobante panel → scan `pam_panel` en gate-host → operador ve receipt.

#### 2.3 Retirar proxy viejo (casinodragon nginx)

1. Quitar `location /receipt-gate/` de `casinodragon-test.conf`.
2. `sudo nginx -t && sudo systemctl reload nginx`.
3. Verificar que `https://test.megamooneymaker.com/receipt-gate/health` → **404/403** (ya no existe).

#### 2.4 Apagar gate local en casinodragon

```bash
cd ~/receipt-gate
docker compose down
# Opcional: conservar volumen 7 días por rollback
# docker volume ls | grep gate-data
```

---

### Fase 3 — Limpieza post-migración

| Tarea | Dónde |
|-------|-------|
| Actualizar `RECEIPT_PUBLIC_URL` en vault | `credenciales/receipt-gate.env` |
| Actualizar CRM `.env` en vault | `credenciales/crm.env` |
| Actualizar PAM `.env` en vault | `credenciales/pam.env` |
| Revocar tokens viejos del gate en casinodragon | rotación completada en Fase 2 |
| Quitar regla SG que permitía CRM→4100 en casinodragon (si existía) | AWS console |
| Actualizar runbook §7–§8 | `08_RUNBOOK.md` → apuntar a gate-host |
| Backup gate-host | Snapshot EBS del volumen Docker + dump SQLite periódico |
| Monitoreo | Alerta si `/health` clamav false o 5xx en `/scan` |

---

## 4. Checklist de validación E2E (post-corte)

Ejecutar en orden; todos deben pasar antes de dar por cerrada la migración.

- [ ] `node scripts/smoke.mjs https://gate-test.megamooneymaker.com <TOKEN_CRM>` → 5 ok
- [ ] Livechat: comprobante → scan `crm_livechat` en gate-host SQLite
- [ ] PAM panel: comprobante → scan `pam_panel` en gate-host SQLite
- [ ] Operador PAM: imagen carga por proxy Bearer (`view_url` del scan)
- [ ] Gate caído (`docker stop gate`): CRM rechaza/fail-closed; PAM → `manual_review` (no acreditar a ciegas)
- [ ] Desde IP no allowlisted: `curl gate-test/health` → **403** (nginx deny)
- [ ] `GET /scans/:id` con Bearer devuelve metadata + `duplicate_global`
- [ ] No queda proceso `receipt-gate` en casinodragon (`docker ps`)

---

## 5. Rollback

Si algo falla tras el corte:

1. **CRM:** revertir `RECEIPT_GATE_URL` a `https://test.megamooneymaker.com/receipt-gate` + token viejo → `pm2 restart`.
2. **PAM:** revertir `.env` a `http://receipt-gate:4100` + token viejo → redeploy + `docker network connect receipt-net casinodragon-test`.
3. **casinodragon:** `cd ~/receipt-gate && docker compose up -d` + restaurar nginx `/receipt-gate/`.
4. Validar smoke en URL vieja.

Mantener el gate viejo **apagado pero no borrado** (volumen + `.env`) durante 1 sprint de test.

---

## 6. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| `view_url` viejos invalidados al rotar `RECEIPT_VIEW_SECRET` | Operador no ve comprobantes antiguos | Aceptable en test; en prod migrar secret solo en ventana |
| Latencia cross-region CRM→gate (east-1→east-2) | Scan +4–8 s | Monitorear; ClamAV warm; considerar medium instance |
| ClamAV primera descarga de firmas | Gate unhealthy ~2 min | `start_period` en healthcheck; no cortar hasta healthy |
| PAM olvida redeploy tras cambio `.env` | Sigue gate viejo o falla | Checklist Fase 2.2 + verificar scan en DB correcta |
| DNS TTL | Clientes cachean IP vieja | TTL bajo 300 s antes del corte |
| Single point of failure | Gate caído = sin depósitos | Fail-closed documentado; alertas; futuro: standby cold |

---

## 7. Después de la migración (prod hardening)

No bloquean el corte test, pero van en la misma hoja de ruta:

| ID | Tarea | Repo |
|----|-------|------|
| G5 | Sandbox efímero poppler/sharp (F4) | Programa Comprobantes |
| I5 | Deprecar gate local embebido en CRM (`receipt-gate/receipt-gate.ts`) | CRM |
| — | `PAM_CLIENT=http` (FakePam → PAM real) | CRM |
| — | WhatsApp → gate (`crm_whatsapp`) | CRM |
| — | Secrets Manager / SSM en lugar de `.env` plano | Infra |
| — | Host prod separado de test (`gate.megamooneymaker.com`) | Infra |

---

## 8. Resumen ejecutivo

| Pregunta | Respuesta |
|----------|-----------|
| ¿CRM y gate en servidores distintos hoy? | **Sí** (SenderIO vs casinodragon) |
| ¿Gate en host propio hoy? | **No** — comparte casinodragon con PAM |
| ¿Cuándo migrar? | Cuando quieras salir del co-hosting test; **no bloquea** seguir con PAM real en CRM |
| Esfuerzo técnico | 1 EC2 nuevo + DNS + nginx + switch 2 `.env` + validación E2E |
| Downtime esperado | **~0** con blue/green; rollback < 15 min si falla validación |

**Próximo paso operativo:** crear EC2 gate-test (Fase 0) y correr `smoke.mjs` contra el host nuevo sin tocar clientes.
