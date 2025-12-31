# Cómo Activar Cloudflare R2 en el Futuro

Este proyecto está configurado para usar **almacenamiento local** por defecto, pero tiene soporte completo para **Cloudflare R2** (almacenamiento en la nube).

## ¿Por qué activar R2?

**Ventajas:**
- ✅ Sin costos de egreso (bajada de archivos gratis)
- ✅ Escalabilidad ilimitada
- ✅ No ocupa espacio en el servidor
- ✅ Backup automático en la nube
- ✅ CDN global incluido
- ✅ URLs públicas accesibles desde cualquier lugar

**Desventajas:**
- ❌ Requiere configuración inicial
- ❌ Costo mensual (~$0.23/mes para 30k archivos)
- ❌ Depende de conexión a internet

---

## Pasos para Activar R2

### 1. Crear cuenta en Cloudflare

1. Ir a https://dash.cloudflare.com/
2. Crear cuenta gratuita
3. Verificar email

### 2. Activar R2

1. En el dashboard de Cloudflare, ir a **R2**
2. Click en **Purchase R2**
3. Aceptar los términos (no te cobran hasta que uses más del free tier)

### 3. Crear Bucket

1. Click en **Create bucket**
2. Nombre: `mooneymaker-formulario-comprobantes` (o el que prefieras)
3. Región: Automática (Cloudflare elige la mejor)
4. Click en **Create bucket**

### 4. Obtener Credenciales

1. Ir a **R2** > **Manage R2 API Tokens**
2. Click en **Create API Token**
3. Configurar:
   - **Token name**: `MooneyMaker Backend`
   - **Permissions**:
     - ✅ Object Read & Write
   - **TTL**: No expiration (o 1 year si preferís)
4. Click en **Create API Token**
5. **COPIAR Y GUARDAR** las credenciales:
   - Access Key ID
   - Secret Access Key
   - Account ID (aparece en la URL: `https://dash.cloudflare.com/ACCOUNT_ID/r2`)

### 5. Configurar Variables de Entorno

En Seenode (o donde esté deployado):

1. Ir a **Environment Variables**
2. Agregar estas variables:

```env
R2_ACCOUNT_ID=tu_account_id_aqui
R2_ACCESS_KEY_ID=tu_access_key_aqui
R2_SECRET_ACCESS_KEY=tu_secret_access_key_aqui
R2_BUCKET_NAME=mooneymaker-formulario-comprobantes
R2_PUBLIC_URL=https://pub-XXXXX.r2.dev
```

**Para obtener R2_PUBLIC_URL:**
1. Ir al bucket en Cloudflare
2. Click en **Settings**
3. En **Public access**, click en **Allow Access**
4. Copiar la URL pública que aparece (ejemplo: `https://pub-39f40a76bbb04993b25.r2.dev`)

### 6. Reiniciar el Servidor

1. En Seenode, click en **Restart** o hacer un nuevo deploy
2. Verificar los logs al iniciar:

```
📦 Storage configuration:
  - Mode: ☁️  Cloudflare R2 (Cloud)
  - Upload directory: uploads
```

### 7. Probar

1. Crear un nuevo egreso con comprobante
2. Verificar en los logs:

```
☁️ Subiendo archivo.pdf a R2 (64.55 KB)
✅ Archivo subido a R2: https://pub-XXXXX.r2.dev/1735686400000_archivo.pdf
```

3. Abrir la URL del comprobante en el navegador
4. Debería mostrar el PDF correctamente

---

## ¿Qué pasa con los archivos que ya existen localmente?

Los archivos que ya subiste localmente **NO se migran automáticamente** a R2.

**Opciones:**

### Opción A: Dejarlos como están (recomendado)
- Los archivos viejos siguen en `uploads/` y funcionan
- Los archivos nuevos se suben a R2
- Ambos conviven sin problemas

### Opción B: Migrar todo a R2
Usar la CLI de Cloudflare Wrangler:

```bash
# Instalar Wrangler
npm install -g wrangler

# Login
wrangler login

# Subir todos los archivos locales a R2
cd backend/uploads
for file in *; do
  wrangler r2 object put mooneymaker-formulario-comprobantes/$file --file=$file
done
```

Luego actualizar manualmente las URLs en la base de datos.

---

## Volver a Almacenamiento Local

Si R2 da problemas o querés ahorrar costos:

1. En Seenode, **eliminar** las 5 variables de R2
2. Reiniciar el servidor
3. Los logs mostrarán:

```
📦 Storage configuration:
  - Mode: 💾 Local Disk
  - Upload directory: uploads
```

4. Los archivos se guardarán localmente de nuevo

---

## Costos Estimados

Para 1000 transacciones/día (30,000/mes):

| Concepto | Cantidad | Precio | Total |
|----------|----------|--------|-------|
| Almacenamiento | 5 GB | $0.015/GB/mes | $0.075 |
| Escrituras (Clase A) | 30,000 | $4.50/millón | $0.135 |
| Lecturas (Clase B) | 60,000 | $0.36/millón | $0.022 |
| Egreso (bajadas) | Ilimitado | **$0.00** | **$0.00** |
| **TOTAL** | | | **~$0.23/mes** |

**Free tier de R2:**
- 10 GB almacenamiento/mes gratis
- 1 millón operaciones Clase A/mes gratis
- 10 millones operaciones Clase B/mes gratis
- Egreso siempre gratis

Con tu volumen actual, **probablemente todo entre en el free tier** = $0/mes

---

## Troubleshooting

### Error SSL/TLS
Si aparece `SSL alert handshake failure`, el código ya tiene configuración compatible incluida. Si persiste:

1. Verificar que Node.js sea versión 18 o superior
2. Revisar `docs/ANALISIS_ERROR_SSL_R2.md`
3. Contactar soporte de Seenode

### Error "Access Denied"
- Verificar credenciales (Access Key ID y Secret)
- Regenerar API Token en Cloudflare

### Error "NoSuchBucket"
- Verificar que el nombre del bucket sea exacto
- Verificar que el bucket existe en Cloudflare

---

## Contacto y Soporte

- **Cloudflare R2 Docs**: https://developers.cloudflare.com/r2/
- **Cloudflare Discord**: https://discord.gg/cloudflaredev
- **Documentación del proyecto**: `docs/R2_TROUBLESHOOTING.md`
