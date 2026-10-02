# Runbook — levantar y testear GATE

> Cómo correr el gate y probarlo con el CRM (y, más adelante, con el panel del PAM).
> Pensado para **testeo local** en esta PC. Para producción ver § Docker al final.

## 0. Tokens (quién usa cuál)

El gate acepta varios tokens (CSV `RECEIPT_GATE_TOKENS`). Convención:

| Cliente | Token (vault `receipt-gate.env`) | Dónde se setea |
|---------|----------------------------------|----------------|
| CRM | 1º de `RECEIPT_GATE_TOKENS` | `CRM/app/backend/.env` → `RECEIPT_GATE_TOKEN` |
| PAM | 2º de `RECEIPT_GATE_TOKENS` | (pendiente, otra instancia) |

Los valores reales viven en `C:\Users\lauta\Desktop\credenciales\receipt-gate.env`
(y el `.env` local del repo). **Nunca** en git.

---

## 1. Levantar el gate (local, :4100)

```powershell
cd "C:\Users\lauta\Desktop\Programa Comprobantes"
npm install          # primera vez
npm run dev          # tsx watch — recarga al editar
```

Logs esperados al arrancar:
- `receipt-gate escuchando` (port 4100, auth: true)
- `capacidades del host` (heif/avif/gif/tiff, poppler, clamav)
- La IA forense usa **Claude** (key `ANTHROPIC_API_KEY` en `.env`). Sin key → `forensic_status: skipped`.

> ⚠️ Un solo proceso por puerto. Si ves `EADDRINUSE`, ya hay un gate corriendo; matá el viejo
> antes de levantar otro.

### Verificación rápida (smoke)

```powershell
node scripts/smoke.mjs http://localhost:4100 <TOKEN_CRM>
```
Debe dar `5 ok, 0 fallos`. Prueba ambos canales (`crm_livechat`, `pam_panel`) + rechazos de borde.

### Test con comprobantes reales (extracción + banco)

**Carpeta oficial (Google Drive):**  
https://drive.google.com/drive/folders/1X014DuCtbYDvFc_0CTY9bFvmHjgNoZeM

Son fotos/PDFs reales para probar que el gate lee bien monto, banco, etc. El gate **no**
lee Drive directo: descargá la carpeta a tu PC (ej. Escritorio) y apuntá el script ahí.

Copia local habitual (si ya la tenés sincronizada):

```text
C:\Users\lauta\Desktop\Comprobantes para lector\extraidos\Comprobantes para lector
```

```powershell
node scripts/test-real.mjs "C:\Users\lauta\Desktop\Comprobantes para lector\extraidos\Comprobantes para lector" http://localhost:4100 <TOKEN_CRM>
```
Reporta saneo, extracción IA y acierto de banco por archivo.

---

## 2. Cablear el CRM (livechat/WhatsApp → gate)

El cliente HTTP del CRM **ya existe**; solo se configura por `.env`
(`CRM/app/backend/.env`):

```env
RECEIPT_GATE_CLIENT=http                 # http = usar el gate externo (no el local)
RECEIPT_GATE_URL=http://localhost:4100
RECEIPT_GATE_TOKEN=<TOKEN_CRM>           # = 1º token del gate
RECEIPT_GATE_TIMEOUT_MS=30000
```

Levantar el CRM (en otra terminal):
```powershell
cd "C:\Users\lauta\Desktop\CRM\app\backend"
npm run dev
```
Al arrancar, el CRM loguea que usa el gate por HTTP. Probar un depósito por livechat:
el comprobante viaja **CRM → gate → register_deposit (PAM)**.

### Qué mira el CRM de la respuesta del gate
`status`, `mime`, `phash`, `clean_base64` (los reenvía a `register_deposit`). Los campos
nuevos (`scan_id`, `extraction`, `bank`, `view_url`) viajan pero hoy el CRM los ignora
(se cablean en la fase de sinergia — ver `05_INTEGRACION_CRM_PAM.md`).

---

## 3. Panel del PAM (✅ integrado — rama `feat/payments/receipt-gate-integracion`)

El PAM ya consume el gate: el pipeline de depósitos (`processDepositWithAI`) lee por `scan_id`
(`GET /scans/:id`, sin re-OCR) o escanea el archivo del panel (`POST /scan`), y el operador ve
el comprobante por proxy Bearer (`GET /api/payments/[id]/receipt` → `GET /receipts/:id`). El PAM
usa el **2º token** (`uKVy…`). Config en su `.env`:

```env
RECEIPT_GATE_URL=http://localhost:4100   # en EC2: http://receipt-gate:4100 (red docker)
RECEIPT_GATE_TOKEN=<TOKEN_PAM>           # = 2º token del gate
RECEIPT_GATE_TIMEOUT_MS=30000
```

---

## 4. Orden para probar CRM + panel a la vez (objetivo)

1. Gate arriba en `:4100` (§1) — una sola instancia.
2. CRM en `http` apuntando al gate (§2).
3. PAM con la llamada al gate cableada (§3, pendiente).
4. Mandar un comprobante por WhatsApp/livechat (CRM) y otro por el panel (PAM) →
   ambos deben generar un `scan_id` en el gate. Verificar con `GET /scans/:id`.

---

## 5. Mantenimiento

- **Limpieza de expirados:** automática cada `RECEIPT_CLEANUP_INTERVAL_MIN` (def. 60 min) y al
  arrancar. Borra JPEG + registro cuando pasa `expires_at` (`RECEIPT_VIEW_TTL_HOURS`, def. 168h).
- **Datos locales:** `data/receipt-gate.db` (SQLite) + `data/receipts/*.jpg`. Gitignored.
- **Resetear en dev:** parar el gate y borrar `data/` (se recrea al arrancar).

---

## 6. Producción (Docker, host aislado)

```powershell
docker compose --env-file "$env:USERPROFILE\Desktop\credenciales\receipt-gate.env" up --build -d
```
- Levanta `gate` + `clamav` sidecar (fail-closed). El gate expone solo `:4100`.
- Requiere en el env-file: `RECEIPT_GATE_TOKENS`, `RECEIPT_VIEW_SECRET`, `RECEIPT_PUBLIC_URL`,
  `ANTHROPIC_API_KEY`.
- En `production` el gate **aborta** si faltan tokens o `RECEIPT_VIEW_SECRET`.
- Red: el gate accesible **desde** CRM/PAM; el gate **sin** acceso al PAM ni a sus BD.

---

## 7. Deploy a TEST — gate interno en el EC2 del PAM (Etapa 1)

> Objetivo: probar el camino **PAM panel** end-to-end en `test.megamooneymaker.com` sin exponer
> el gate a internet. El gate corre como contenedor en el mismo EC2, alcanzable por el contenedor
> del PAM vía red Docker `receipt-net`. El CRM (Etapa 2) requiere exponer un subdominio HTTPS aparte.

### 7.1 En el EC2 (`ec2-user@3.15.65.122`)

```bash
# 1) Traer el gate
git clone https://github.com/MartinLope369/Programa-Comprobantes.git ~/receipt-gate
cd ~/receipt-gate

# 2) .env del gate (NO commitear). Generar secretos nuevos para test:
cat > .env <<'EOF'
NODE_ENV=production
PORT=4100
DB_PATH=/data/receipt-gate.db
RECEIPT_STORAGE_PATH=/data/receipts
RECEIPT_PUBLIC_URL=http://receipt-gate:4100
RECEIPT_GATE_TOKENS=<token-crm-test>,<token-pam-test>
RECEIPT_VIEW_SECRET=<hex-aleatorio-32b>
RECEIPT_FORENSIC_ENABLED=true
RECEIPT_FORENSIC_REQUIRED=auto
ANTHROPIC_API_KEY=<key-claude>
ANTHROPIC_MODEL=claude-haiku-4-5
EOF

# 3) Levantar gate + ClamAV (fail-closed). 1ª vez ClamAV tarda en bajar firmas (~2 min).
sudo docker compose --env-file .env up --build -d

# 4) Health (loopback de la box)
curl -s http://127.0.0.1:4100/health    # ok:true, clamav.ok:true, ai_configured:true
```

### 7.2 Conectar el contenedor del PAM al gate

```bash
# El PAM corre como contenedor `casinodragon-test`. Unirlo a la red del gate:
sudo docker network connect receipt-net casinodragon-test

# En ~/casinodragon-test/.env agregar:
#   RECEIPT_GATE_URL=http://receipt-gate:4100
#   RECEIPT_GATE_TOKEN=<token-pam-test>   (= 2º de RECEIPT_GATE_TOKENS)
# y redeploy de la rama del PAM:
bash ~/deploy-test.sh feat/payments/receipt-gate-integracion
```

> Si `deploy-test.sh` recrea el contenedor, volver a hacer `docker network connect receipt-net
> casinodragon-test` (o agregar `--network receipt-net` al `docker run` del script de test).

### 7.3 Validar el camino PAM en test

1. Subí un comprobante real desde `test.megamooneymaker.com` (panel del cliente).
2. En el panel de **Operaciones**, abrí la ficha → la imagen carga por el proxy Bearer
   (`/api/payments/[id]/receipt`), nunca por `/uploads` público.
3. En el EC2: `curl -s http://127.0.0.1:4100/stats -H "Authorization: Bearer <token-pam-test>"`
   → `aceptados` sube de a 1 por comprobante (no hay doble scan).
4. Caso gate caído (`sudo docker stop receipt-gate`): un depósito nuevo debe quedar en
   `manual_review` (fail-closed), nunca acreditarse a ciegas.

### 7.4 Notas de seguridad (test)

- Gate **sin puerto público** (solo `127.0.0.1:4100` + red `receipt-net`). El security group del
  EC2 **no** debe abrir 4100 a internet.
- Co-ubicado con `casino.db`: aceptable en test (DB descartable). En prod, host separado (G5 sandbox).
- Tokens y `RECEIPT_VIEW_SECRET` **distintos** de los de prod.

---

## 8. Deploy a TEST — Etapa 2 (CRM SenderIO → gate HTTPS)

> Objetivo: que el CRM en **SenderIO** (`3.212.43.206`, us-east-1) llame al gate por HTTPS.
> El PAM **sigue** usando la red Docker interna (`http://receipt-gate:4100`).

### 8.1 Gate expuesto (ya en el EC2 del PAM)

- URL CRM: `https://test.megamooneymaker.com/receipt-gate`
- Nginx: `location /receipt-gate/` en `casinodragon-test.conf`, proxy a `127.0.0.1:4100`
- Firewall nginx: solo `3.212.43.206` (SenderIO) + `127.0.0.1` (ops)
- `RECEIPT_PUBLIC_URL=https://test.megamooneymaker.com/receipt-gate` en `~/receipt-gate/.env`

> Alternativa futura: DNS `gate-test.megamooneymaker.com` → `3.15.65.122` + cert dedicado.

### 8.2 Configurar CRM en SenderIO

En el EC2 del gate, imprimir variables:

```bash
bash ~/receipt-gate/scripts/print-etapa2-crm-env.sh
```

En **SenderIO**, pegar en `CRM/app/backend/.env` (o usar el script):

```bash
export RECEIPT_GATE_TOKEN='<1er token del gate>'
bash configure-senderio-etapa2.sh
```

Variables requeridas:

```env
RECEIPT_GATE_CLIENT=http
RECEIPT_GATE_URL=https://test.megamooneymaker.com/receipt-gate
RECEIPT_GATE_TOKEN=<1º de RECEIPT_GATE_TOKENS>
RECEIPT_GATE_TIMEOUT_MS=30000
```

Reiniciar el backend del CRM y probar:

```bash
curl -sk https://test.megamooneymaker.com/receipt-gate/health
# debe devolver ok:true (desde SenderIO; desde otras IPs → 403)
```

### 8.3 Validar Etapa 2

1. Depósito por **livechat** o **WhatsApp** → CRM llama `/scan` → `register_deposit` al PAM.
2. En el gate: `aceptados` sube; en SQLite aparece `channel=crm_livechat` o `crm_whatsapp`.
3. Panel operador PAM muestra el comprobante (proxy Bearer, mismo `scan_id`).

---

## 9. Reset comprobantes UAT (dedup + scans + JPEGs)

> **Scope GATE only.** Limpia anti-duplicado pHash, `scan_records` y JPEGs saneados en `/data`.
> **No** borra depósitos ni dedup COELSA en PAM — si el rechazo es por COELSA duplicado, ops debe
> limpiar también en PAM (fuera de este runbook).

### Qué borra GATE

| Tabla / disco | Efecto en `/scan` |
|---------------|-------------------|
| `phash_comprobante` | Deja de rechazar `reason: duplicate` (pHash por `subject_id`) |
| `scan_records` | Borra historial + señal `duplicate_global` (sha256) |
| `/data/receipts/*.jpg` | GET `/receipts/:scan_id` falla para ids viejos |

Rate-limits en memoria del proceso **no** se resetean con SQLite → reiniciar contenedor tras wipe full.

### Comandos (gate prod EC2 `3.12.87.253`)

```bash
ssh -i ~/Desktop/credenciales/GATE/keys/GateAI.pem ec2-user@3.12.87.253
cd ~/gate
git pull --ff-only && docker compose up -d --build   # tras merge del script en main

# Preview (sin escribir)
docker compose exec gate node dist/ops/wipe-uat-dedup-cli.js --full

# Wipe FULL UAT — todo dedup + scans + receipts GATE
docker compose exec gate node dist/ops/wipe-uat-dedup-cli.js --full --yes
docker compose restart gate

# Wipe PARCIAL — solo un lead (`subject_id` del CRM livechat)
docker compose exec gate node dist/ops/wipe-uat-dedup-cli.js --subject-id <lead-uuid> --yes
docker compose restart gate
```

Local (dev):

```powershell
npm run build
npm run wipe:uat -- --full --yes
```

### Verificación post-wipe

```bash
docker compose exec gate node -e "import('./dist/db/scans.js').then(m=>console.log('scans',m.countScans()))"
curl -s http://127.0.0.1:4100/health
```

Re-escaneo: CRM reenvía el mismo archivo → `/scan` debe **aceptar** (si PAM no bloquea por COELSA).

