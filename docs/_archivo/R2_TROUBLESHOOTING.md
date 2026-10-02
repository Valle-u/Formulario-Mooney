# Troubleshooting: Cloudflare R2

Guía para resolver problemas comunes con el almacenamiento en Cloudflare R2.

## Error: SSL handshake failure

**Error completo:**
```
write EPROTO C06C89AFE77F0000:error:0A000410:SSL routines:ssl3_read_bytes:ssl/tls alert handshake failure
```

### Causa
Este error ocurre cuando hay incompatibilidad en la configuración SSL/TLS entre el cliente y el servidor de Cloudflare R2.

### Solución aplicada
1. **Eliminado el agente HTTPS personalizado** que forzaba `rejectUnauthorized: false`
2. **Configurado el cliente S3 correctamente** para Cloudflare R2:
   - `forcePathStyle: false` (R2 usa virtual-hosted-style URLs)
   - Usar el agente HTTPS por defecto de Node.js
   - Timeout de 30 segundos (suficiente para la mayoría de archivos)

### Verificar Node.js
Cloudflare R2 requiere **Node.js 18+**. Verificar versión:
```bash
node --version
```

Si usás una versión menor, actualizar Node.js.

---

## Configuración de Cloudflare R2

### 1. Crear Bucket

1. Ir a [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. R2 > Create bucket
3. Nombrar el bucket (ejemplo: `mooneymaker-formulario-premios-comprobantes`)
4. Región: automática

### 2. Configurar acceso público (opcional)

Si querés que los archivos sean públicos sin autenticación:

1. Ir al bucket > Settings > Public access
2. Conectar un dominio personalizado o usar `*.r2.dev`
3. Copiar la URL pública

**Nota:** Para un casino, se recomienda mantener el bucket **privado** y usar URLs firmadas si es necesario.

### 3. Crear API Token

1. R2 > Manage R2 API Tokens > Create API Token
2. Nombre: `MooneyMaker Backend`
3. Permisos:
   - Object Read: Allow
   - Object Write: Allow
4. TTL: sin expiración (o según política de seguridad)
5. **Guardar las credenciales**:
   - Access Key ID
   - Secret Access Key
   - Account ID (aparece en la URL del dashboard)

### 4. Configurar variables de entorno

En el archivo `.env` de producción (Seenode, Render, etc.):

```env
R2_ACCOUNT_ID=tu_account_id_de_32_caracteres
R2_ACCESS_KEY_ID=tu_access_key_id
R2_SECRET_ACCESS_KEY=tu_secret_access_key_muy_larga
R2_BUCKET_NAME=mooneymaker-formulario-premios-comprobantes
R2_PUBLIC_URL=https://tu-dominio.r2.dev
```

**Importante:**
- Estas variables son **secretas**, nunca subirlas a GitHub
- En desarrollo local, podés dejarlas vacías para usar almacenamiento local

---

## Verificar conexión

### Logs esperados al iniciar el servidor

Si R2 **está configurado** correctamente:
```
✅ R2 configurado: mooneymaker-formulario-premios-comprobantes
```

Si R2 **NO está configurado**:
```
⚠️  Cloudflare R2 no está configurado. Faltan variables: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID
⚠️  Los archivos se guardarán localmente en lugar de R2
```

### Logs al subir un archivo

**Éxito:**
```
☁️ Subiendo 1672221577181_14570-1767220741.pdf a R2 (64.55 KB)
✅ Archivo subido a R2: https://tu-bucket.r2.dev/1672221577181_14570-1767220741.pdf
```

**Error:**
```
❌ Error subiendo archivo a R2:
  Mensaje: Network timeout value must be greater than 0
  Código: TimeoutError
```

---

## Problemas comunes

### 1. Error: "Access Denied"

**Causa:** Las credenciales son incorrectas o el token no tiene permisos.

**Solución:**
1. Verificar que `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY` sean correctas
2. Recrear el API Token con permisos de lectura/escritura
3. Verificar que el bucket existe

### 2. Error: "NoSuchBucket"

**Causa:** El nombre del bucket es incorrecto.

**Solución:**
1. Verificar `R2_BUCKET_NAME` en `.env`
2. El nombre debe ser exactamente igual al creado en Cloudflare

### 3. Error: "Timeout"

**Causa:** Archivo muy grande o conexión lenta.

**Solución:**
1. Aumentar `MAX_UPLOAD_MB` si es necesario (cuidado con el límite)
2. Verificar la conexión a internet del servidor
3. Si es un archivo de 10MB, puede tardar 5-10 segundos en subir

### 4. Los archivos se guardan localmente en vez de R2

**Causa:** Las variables de entorno no están configuradas.

**Solución:**
1. Verificar que TODAS las variables de R2 estén en `.env`:
   ```bash
   # En el servidor
   echo $R2_ACCOUNT_ID
   echo $R2_ACCESS_KEY_ID
   ```
2. Reiniciar el servidor después de agregar las variables
3. Verificar los logs al iniciar el servidor

---

## Migrar archivos locales a R2

Si ya tenés archivos guardados localmente y querés migrarlos a R2:

```bash
# Usar Rclone o la CLI de Cloudflare Wrangler
npx wrangler r2 object put <bucket-name>/<file> --file=./uploads/<file>
```

O crear un script de migración personalizado.

---

## Costos

Cloudflare R2 ventajas:
- **Sin costos de egreso** (bajada de archivos)
- Almacenamiento: $0.015/GB/mes
- Operaciones Clase A (escritura): $4.50 por millón
- Operaciones Clase B (lectura): $0.36 por millón

Para 1000 transacciones/día (30.000/mes):
- Almacenamiento: ~5GB = $0.075/mes
- Escrituras: 30k = $0.135/mes
- Lecturas: estimado 60k = $0.022/mes
- **Total: ~$0.23/mes**

Muy económico comparado con S3 que cobra por egreso.

---

## Alternativa: Volver a almacenamiento local

Si R2 da problemas y necesitás una solución rápida:

1. Comentar o eliminar las variables de R2 del `.env`:
   ```env
   # R2_ACCOUNT_ID=
   # R2_ACCESS_KEY_ID=
   # R2_SECRET_ACCESS_KEY=
   # R2_BUCKET_NAME=
   ```

2. Reiniciar el servidor

3. Los archivos se guardarán en `uploads/` automáticamente

**Desventajas del almacenamiento local:**
- Ocupa espacio en el servidor
- Si el servidor se reinicia/destruye, se pierden los archivos
- No hay CDN ni distribución geográfica
