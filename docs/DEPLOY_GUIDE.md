# Guía de Deploy - Mooney Maker

Esta guía te ayuda a subir el proyecto a producción en diferentes plataformas.

## 📋 Pre-requisitos

Antes de deployar, asegurate de tener:

1. ✅ Cuenta en GitHub
2. ✅ Repositorio creado (público o privado)
3. ✅ Código pusheado a GitHub
4. ✅ Variables de entorno listas (ver abajo)

## 🚀 Opción 1: Render.com (RECOMENDADO)

### Ventajas
- ✅ Free tier generoso
- ✅ PostgreSQL incluido gratis
- ✅ Despliegue automático desde GitHub
- ✅ HTTPS gratis
- ✅ Fácil configuración

### Pasos

#### A. Deploy del Backend

1. **Crear cuenta en Render.com**
   - Ir a https://render.com
   - Sign up with GitHub

2. **Crear PostgreSQL Database**
   - Dashboard → New → PostgreSQL
   - Name: `mooney-db`
   - Database: `mooney_production`
   - User: `mooney_user`
   - Plan: **Free**
   - Click "Create Database"
   - **COPIAR** el "Internal Database URL" (lo vas a necesitar)

3. **Crear Web Service**
   - Dashboard → New → Web Service
   - Connect tu repositorio GitHub
   - Name: `mooney-api`
   - Environment: **Node**
   - Branch: `main`
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: **Free**

4. **Configurar Variables de Entorno**

   En la sección "Environment":

   ```
   NODE_ENV = production
   PORT = 4000
   DATABASE_URL = <pegar Internal Database URL de paso 2>
   JWT_SECRET = <generar 64 caracteres random>
   CORS_ORIGIN = <URL de tu frontend cuando lo deploys>
   UPLOAD_DIR = uploads
   ```

   Para generar JWT_SECRET:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

5. **Add Disk for Uploads** (Opcional pero recomendado)

   - En el dashboard del web service
   - Disks → Add Disk
   - Name: `mooney-uploads`
   - Mount Path: `/app/uploads`
   - Size: 1 GB
   - Create

6. **Deploy**

   - Click "Create Web Service"
   - Esperar 2-3 minutos
   - Verificar logs que diga "API running on..."
   - **COPIAR** la URL (ej: `https://mooney-api.onrender.com`)

#### B. Deploy del Frontend

1. **Actualizar URL del Backend**

   Editar `frontend/public/app.js` línea 1:
   ```javascript
   const API_BASE = "https://mooney-api.onrender.com";
   ```

   Commit y push:
   ```bash
   git add frontend/public/app.js
   git commit -m "Update API URL for production"
   git push
   ```

2. **Crear Static Site**

   - Render Dashboard → New → Static Site
   - Connect repo
   - Name: `mooney-frontend`
   - Branch: `main`
   - **Publish Directory**: `frontend/public`
   - Click "Create Static Site"

3. **Actualizar CORS en Backend**

   - Volver al dashboard de `mooney-api`
   - Environment → CORS_ORIGIN
   - Cambiar a: `https://mooney-frontend.onrender.com`
   - Save Changes (se redeploya automáticamente)

4. **Crear Usuario Admin**

   En el Shell del web service backend:
   ```bash
   npm run seed:admin
   ```

5. **¡Listo!**

   Abrir `https://mooney-frontend.onrender.com`
   - Login: `admin` / `admin123`
   - Cambiar contraseña inmediatamente

---

## 🚀 Opción 2: Railway.app

### Pasos

1. **Sign up en Railway.app** con GitHub

2. **New Project → Deploy from GitHub**
   - Seleccionar tu repo
   - Railway detecta automáticamente Node.js

3. **Add PostgreSQL**
   - Add Plugin → PostgreSQL
   - Railway crea automáticamente la DB y setea `DATABASE_URL`

4. **Configurar Variables**

   Settings → Variables:
   ```
   JWT_SECRET = <random 64 chars>
   CORS_ORIGIN = https://tu-frontend.railway.app
   UPLOAD_DIR = uploads
   ```

5. **Configurar Root Directory**

   Settings → Build:
   - Root Directory: `backend`
   - Start Command: `npm start`

6. **Deploy Frontend** (opcional)

   New Service → Static Site:
   - Root: `frontend/public`

7. **Seed Admin**
   ```bash
   railway run npm run seed:admin
   ```

---

## 🚀 Opción 3: Vercel (Frontend) + Render (Backend)

### Frontend en Vercel

1. **Instalar Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Deploy**
   ```bash
   cd frontend/public
   vercel --prod
   ```

3. **O usar Vercel Dashboard**
   - Importar proyecto desde GitHub
   - Root Directory: `frontend/public`
   - Framework Preset: Other
   - Deploy

### Backend en Render
   - Seguir pasos de Opción 1 (solo backend)

---

## 🚀 Opción 4: AWS (Avanzado)

### Componentes

- **EC2**: Backend Node.js
- **RDS**: PostgreSQL
- **S3**: Archivos uploads
- **CloudFront**: Frontend estático

### Setup Rápido

1. **RDS PostgreSQL**
   - Create Database → PostgreSQL
   - Free tier elegible
   - Anotar endpoint

2. **EC2 Instance**
   ```bash
   ssh -i key.pem ubuntu@ec2-ip

   # Install Node
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # Clone repo
   git clone <tu-repo>
   cd backend
   npm install

   # Setup .env
   nano .env
   # Pegar variables

   # Start with PM2
   sudo npm install -g pm2
   pm2 start src/server.js --name mooney-api
   pm2 startup
   pm2 save
   ```

3. **S3 para Frontend**
   - Create bucket
   - Upload `frontend/public/*`
   - Enable static website hosting
   - Update bucket policy

---

## 🔒 Checklist de Seguridad Post-Deploy

Antes de considerar el deploy completo:

- [ ] Cambiar contraseña de admin
- [ ] JWT_SECRET es único y random (64+ chars)
- [ ] CORS_ORIGIN apunta solo a tu frontend
- [ ] DATABASE_URL es segura (no usar default password)
- [ ] HTTPS habilitado (Render/Railway lo hacen automático)
- [ ] Variables de entorno NO están en el código
- [ ] `.env` está en `.gitignore`
- [ ] Crear más usuarios con contraseñas fuertes
- [ ] Probar límite de rate limiting (5 intentos de login)
- [ ] Verificar que archivos solo sean accesibles con auth

---

## 🧪 Testing en Producción

1. **Health Check**
   ```bash
   curl https://mooney-api.onrender.com/health
   # Debe devolver: {"ok":true}
   ```

2. **Login**
   - Abrir frontend
   - Login con admin/admin123
   - Debe funcionar y redirigir

3. **Crear Egreso**
   - Llenar formulario completo
   - Subir comprobante (PDF o imagen)
   - Verificar que se guarde

4. **Export CSV**
   - Ir a "Consulta Egresos"
   - Aplicar filtros
   - Descargar CSV
   - Verificar datos

5. **Ver Logs**
   - Login como admin
   - Ir a "Logs"
   - Verificar que aparezcan las acciones

---

## 🐛 Troubleshooting Producción

### "Failed to fetch" en frontend

**Causa**: CORS o backend no responde

**Solución**:
1. Verificar que backend esté corriendo (abrir URL en navegador)
2. Verificar CORS_ORIGIN en backend
3. Check browser DevTools → Network → ver error exacto

### "Internal Server Error" en API

**Causa**: Error en el código o DB no conectada

**Solución**:
1. Ver logs del backend en Render/Railway dashboard
2. Verificar DATABASE_URL
3. Verificar que migraciones corrieron OK

### Archivos uploads no persisten

**Causa**: Free tier no tiene persistent storage por defecto

**Solución**:
1. Render: Add Disk (ver paso A.5)
2. Railway: Add Volume
3. AWS: Usar S3 en lugar de filesystem local

### Rate limiting no funciona

**Causa**: Múltiples instancias o proxy sin IP forwarding

**Solución**:
- Render: Funciona OK (single instance en free tier)
- Railway: Configurar `trust proxy` en Express
- AWS: Usar Redis store para express-rate-limit

---

## 📊 Monitoreo

### Render

- Dashboard → Tu servicio → Logs
- Ver CPU, Memory, requests

### Railway

- Project → Metrics
- Logs en tiempo real

### Uptime Monitoring (Gratis)

- **UptimeRobot**: https://uptimerobot.com
  - Monitor cada 5 minutos
  - Email alert si cae

- **Better Uptime**: https://betteruptime.com
  - Monitor cada 30 segundos (free tier)
  - SMS/Email alerts

---

## 💰 Costos Aproximados

### Free Tier (Render)
- Backend: Gratis (sleep after 15min inactivity)
- PostgreSQL: Gratis (1GB storage, expires 90 days)
- Frontend Static: Gratis
- **Total: $0/mes**

### Paid (Render)
- Backend: $7/mes (no sleep, más RAM)
- PostgreSQL: $7/mes (persistent)
- **Total: $14/mes**

### Railway
- $5 de crédito gratis/mes
- Luego: ~$10-15/mes usage-based

### AWS
- Free tier primer año
- Luego: ~$15-25/mes (t2.micro + RDS)

---

## ✅ Siguiente Paso

Una vez deployado exitosamente:

1. **Documentar las URLs**:
   - Backend API: `_____________________`
   - Frontend: `_____________________`
   - Database: `_____________________`

2. **Compartir con equipo**:
   - Credenciales admin
   - URLs de acceso
   - Esta guía

3. **Setup backups** (PostgreSQL):
   - Render: Backups automáticos en paid tier
   - Railway: Manual export desde dashboard
   - AWS RDS: Configurar automated backups

4. **Monitoreo**:
   - Setup UptimeRobot
   - Verificar logs diariamente

---

## 📞 Soporte

Si tenés problemas durante el deploy:

1. Revisar logs del servicio
2. Verificar todas las variables de entorno
3. Consultar docs oficiales:
   - Render: https://render.com/docs
   - Railway: https://docs.railway.app

¡Éxito con el deploy! 🚀
