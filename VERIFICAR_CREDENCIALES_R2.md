# 🔑 Cómo Verificar y Generar Nuevas Credenciales de Cloudflare R2

## ⚠️ Problema Actual

El error `sslv3 alert handshake failure` puede indicar:
1. Problema SSL/OpenSSL (ya descartado - tienes OpenSSL actualizado)
2. **Credenciales incorrectas o expiradas** ← Más probable
3. Bucket no existe
4. Permisos insuficientes

## 📋 Pasos para Verificar y Generar Nuevas Credenciales

### Paso 1: Inicia sesión en Cloudflare

1. Ve a https://dash.cloudflare.com
2. Inicia sesión con tu cuenta
3. Si tienes múltiples cuentas, selecciona la correcta

### Paso 2: Ve a R2

1. En el menú lateral, haz clic en **R2**
2. Si no ves R2, búscalo en la barra superior

### Paso 3: Verifica que el bucket existe

1. Busca el bucket: `mooneymaker-formulario-premios-comprobantes`
2. Si **NO existe**:
   - Créalo: Click en "Create bucket"
   - Nombre: `mooneymaker-formulario-premios-comprobantes`
   - Región: Automatic (recomendado)
   - Click "Create bucket"

3. Si **SÍ existe**:
   - Click en el bucket para abrirlo
   - Verifica que no tenga restricciones

### Paso 4: Configurar acceso público (IMPORTANTE)

1. Dentro del bucket, ve a **Settings**
2. Busca la sección **Public Access**
3. Click en "Edit"
4. Activa: **"Allow Access"**
5. Te dará una URL pública como: `https://pub-xxxxx.r2.dev`
6. **COPIA ESTA URL** (la necesitarás después)

### Paso 5: Generar nuevas API Tokens

1. En la página de R2, click en **Manage R2 API Tokens**
2. Click en **Create API Token**
3. Configura el token:
   - **Token name**: `MooneyMaker Formulario Token`
   - **Permissions**: **Admin Read & Write**
   - **Specify bucket(s)**: Selecciona solo `mooneymaker-formulario-premios-comprobantes`
   - **TTL**: Sin límite (o 1 año)
4. Click **Create API Token**

### Paso 6: Copiar las credenciales

Cloudflare te mostrará:
```
Access Key ID: xxxxxxxxxxxxxxxxx
Secret Access Key: yyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

⚠️ **IMPORTANTE**: Solo podrás ver el Secret Access Key UNA VEZ. Cópialo ahora.

### Paso 7: Obtener el Account ID

En la misma página, verás:
```
Use the following when creating an S3-compatible client:
Account ID: zzzzzzzzzz
```

Copia este Account ID.

### Paso 8: Actualizar el .env

Abre `backend/.env` y actualiza:

```bash
# Cloudflare R2 Storage - CREDENCIALES NUEVAS
R2_ACCOUNT_ID=zzzzzzzzzz  # El Account ID que acabas de copiar
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxxx  # El Access Key ID nuevo
R2_SECRET_ACCESS_KEY=yyyyyyyyyyyyyyyyyyyyyyyyyyyy  # El Secret Access Key nuevo
R2_BUCKET_NAME=mooneymaker-formulario-premios-comprobantes
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev  # La URL pública del paso 4
```

### Paso 9: Probar de nuevo

```bash
cd backend
node test-r2-fetch.js
```

**Si funciona**, verás:
```
✅ ¡ÉXITO! Archivo subido correctamente
🔗 URL pública: https://pub-xxxxx.r2.dev/test-xxxxx.txt
✅ Archivo eliminado correctamente
🎉 ¡PRUEBA COMPLETADA CON ÉXITO!
```

## 🔍 Posibles Errores y Soluciones

### Error: "HTTP 403: Access Denied"
- **Causa**: Credenciales incorrectas
- **Solución**: Repite los pasos 5-8 con nuevas credenciales

### Error: "HTTP 404: Not Found"
- **Causa**: Bucket no existe o nombre incorrecto
- **Solución**: Verifica el nombre del bucket (paso 3)

### Error: "SSL handshake failure" (sigue apareciendo)
- **Causa**: Las credenciales antiguas aún causan rechazo SSL
- **Solución**: Elimina el token antiguo en Cloudflare:
  1. R2 → Manage R2 API Tokens
  2. Encuentra el token antiguo
  3. Click en los 3 puntos → Delete
  4. Genera uno nuevo (pasos 5-8)

### Error: "SignatureDoesNotMatch"
- **Causa**: Secret Access Key incorrecto
- **Solución**: Genera nuevas credenciales (el secret no se puede recuperar)

## ✅ Checklist Final

Antes de probar, verifica que tienes:
- [ ] Account ID correcto
- [ ] Access Key ID nuevo (de la generación reciente)
- [ ] Secret Access Key nuevo (de la generación reciente)
- [ ] Nombre del bucket correcto: `mooneymaker-formulario-premios-comprobantes`
- [ ] URL pública correcta (https://pub-xxxxx.r2.dev)
- [ ] Bucket con acceso público habilitado
- [ ] Token con permisos Admin Read & Write

## 🆘 Si nada funciona

Si después de generar nuevas credenciales SIGUE sin funcionar:

1. **Prueba subir un archivo manualmente** en la interfaz de Cloudflare R2
   - Si funciona → El problema es del código
   - Si NO funciona → El problema es de permisos en Cloudflare

2. **Contacta al soporte de Cloudflare**
   - Explica que no puedes subir archivos via API
   - Pide que verifiquen los permisos de tu cuenta

3. **Alternativa temporal**: Usa almacenamiento local
   - Comenta las variables R2 en `.env`
   - Los archivos se guardarán en `uploads/` localmente
   - **SOLO para desarrollo**, no para production en SeeNode

---

**Siguiente paso**: Genera nuevas credenciales y prueba de nuevo.
