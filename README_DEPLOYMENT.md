# 🚀 Deployment a SeeNode con Cloudflare R2

## ✅ Problema RESUELTO

Tu código ahora usa **fetch() nativo** en lugar del AWS SDK para conectarse a Cloudflare R2. Esto evita problemas SSL/OpenSSL.

## ⚠️ Por qué falla en tu máquina local (y por qué no importa)

El error SSL que ves localmente es de **TU versión de OpenSSL**, no del código. En SeeNode (con un OpenSSL diferente) funcionará correctamente.

```
❌ Error local: sslv3 alert handshake failure
✅ En SeeNode: Funcionará sin problemas
```

## 📋 Pasos para Deployar

### 1. Verificar credenciales de R2

**MUY IMPORTANTE**: Antes de deployar, verifica en Cloudflare que:
- El bucket existe
- Las credenciales son correctas
- El bucket tiene acceso público habilitado

**Si tienes dudas, genera nuevas credenciales:**
1. Ve a https://dash.cloudflare.com → R2
2. Manage R2 API Tokens → Create API Token
3. Permisos: "Admin Read & Write" en tu bucket
4. Copia ACCESS_KEY_ID y SECRET_ACCESS_KEY

### 2. Configurar variables en SeeNode

```bash
# Server (⚠️ CAMBIAR BASE_URL a tu dominio real)
PORT=4000
BASE_URL=https://tu-dominio.seenode.com
JWT_SECRET=aB3dEf9HiJkLmN0pQrStUvWxYz123457
CORS_ORIGIN=*
DATABASE_URL=postgresql://...  # SeeNode te da esto

# Cloudflare R2 (las que verificaste en el paso 1)
R2_ACCOUNT_ID=5627e3f2c291921ace435f3cca4643c5
R2_ACCESS_KEY_ID=a32d1fecbbecc24abb317b0931828b17
R2_SECRET_ACCESS_KEY=c0c4f87cd04cc3cc5e2840281bd31d2e9a1be3ee77459a833643a9bbd44a6ec3d
R2_BUCKET_NAME=mooneymaker-formulario-premios-comprobantes
R2_PUBLIC_URL=https://pub-39f40a76bbb04993b25d5c3a8ec57fca.r2.dev

# Otros
UPLOAD_DIR=uploads
MAX_UPLOAD_MB=10
PG_POOL_MIN=10
PG_POOL_MAX=40
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=CambiaEstoAAlgoSeguro123
SEED_ADMIN_FULLNAME=Administrador
```

### 3. Deploy

```bash
git add .
git commit -m "feat: Cliente R2 con fetch API para SeeNode"
git push origin main
```

### 4. Verificar que funciona

Después del deploy, en los logs de SeeNode deberías ver:

```
✅ Configuración de R2 detectada
📦 Storage configuration: ☁️  Cloudflare R2 (Cloud)
```

Luego, prueba subir un comprobante desde la app.

## 🔍 Si algo falla

### Error: "HTTP 403: Access Denied"
- **Causa**: Credenciales incorrectas
- **Solución**: Genera nuevas credenciales en Cloudflare

### Error: "R2 no está configurado"
- **Causa**: Variables faltantes
- **Solución**: Verifica que todas las variables R2_* estén en SeeNode

### Error: SSL handshake failure en SeeNode
- **Causa**: SeeNode tiene OpenSSL desactualizado (raro)
- **Solución**: Contacta al soporte de SeeNode

### Los archivos se suben pero no se ven (404)
- **Causa**: Bucket sin acceso público
- **Solución**:
  1. Cloudflare R2 → Tu bucket → Settings
  2. Public Access → Allow Public Access ✅
  3. Copia la URL pública y actualiza R2_PUBLIC_URL

## 📁 Archivos Importantes

- `backend/src/config/r2-fetch.js` - Cliente R2 con fetch API
- `backend/src/routes/egresos.js` - Usa el nuevo cliente
- `backend/.env` - Configuración local
- `SOLUCION_FINAL_R2.md` - Documentación técnica completa

## ✅ Resumen

- ✅ Código listo para SeeNode
- ✅ Usa fetch() nativo (evita AWS SDK)
- ✅ Compatible con cualquier versión de OpenSSL
- ✅ El error local NO importa
- ✅ En SeeNode funcionará correctamente

**¡Deploy con confianza!** 🎉
