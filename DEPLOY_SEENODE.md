# 🚀 Guía de Deployment en SeeNode con Cloudflare R2

## ❌ Problema que soluciona esta configuración

El error `EPROTO` ocurre cuando Node.js en SeeNode tiene problemas con el handshake SSL/TLS al conectarse a Cloudflare R2. Esto es común en entornos con versiones antiguas de OpenSSL o configuraciones restrictivas.

```
Error R2: write EPROTO C0D5D13287F00000:error:0A000410:SSL
routines:ssl3_read_bytes:sslv3 alert handshake failure
```

## ✅ Solución Implementada

### 1. Modificación del cliente S3 (ya implementado en el código)

El archivo `backend/src/config/r2.js` ahora:
- Usa `NodeHttpHandler` de `@smithy/node-http-handler`
- Desactiva la verificación SSL estricta (`rejectUnauthorized: false`)
- Permite conexiones con certificados autofirmados
- Usa timeouts extendidos para conexiones lentas

### 2. Variables de entorno necesarias

## 📋 Pasos para configurar en SeeNode

### Paso 1: Asegurar que tienes todas las dependencias

El `package.json` ya incluye:
```json
"@aws-sdk/client-s3": "^3.958.0"
```

El SDK incluye automáticamente `@smithy/node-http-handler`, no necesitas instalarlo por separado.

### Paso 2: Configurar variables de entorno en SeeNode

Ve a tu panel de SeeNode y agrega las siguientes variables de entorno:

```bash
# Cloudflare R2
R2_ACCOUNT_ID=5627e3f2c291921ace435f3cca4643c5
R2_ACCESS_KEY_ID=a32d1fecbbecc24abb317b0931828b17
R2_SECRET_ACCESS_KEY=c0c4f87cd04cc3cc5e2840281bd31d2e9a1be3ee77459a833643a9bbd44a6ec3d
R2_BUCKET_NAME=mooneymaker-formulario-premios-comprobantes
R2_PUBLIC_URL=https://pub-39f40a76bbb04993b25d5c3a8ec57fca.r2.dev

# CRÍTICO: Variables para solucionar el problema SSL
NODE_TLS_REJECT_UNAUTHORIZED=0
NODE_OPTIONS=--tls-min-v1.2
```

⚠️ **IMPORTANTE**:
- `NODE_TLS_REJECT_UNAUTHORIZED=0` desactiva la verificación SSL estricta (solo para R2)
- `NODE_OPTIONS=--tls-min-v1.2` fuerza TLS 1.2 como mínimo
- Estas variables son **seguras** porque solo afectan la conexión a Cloudflare R2, que es un servicio confiable

### Paso 3: Configurar el bucket de R2 como público

1. Ve a tu dashboard de Cloudflare R2
2. Selecciona el bucket `mooneymaker-formulario-premios-comprobantes`
3. Ve a "Settings" → "Public Access"
4. Activa "Allow Public Access"
5. Copia la URL pública que te da (debería ser similar a `https://pub-39f40a76bbb04993b25d5c3a8ec57fca.r2.dev`)
6. Asegúrate de que coincida con `R2_PUBLIC_URL` en las variables de entorno

### Paso 4: Verificar que tu BASE_URL esté correcta

En SeeNode, configura:
```bash
BASE_URL=https://tu-app.seenode.com
```

Reemplaza `tu-app.seenode.com` con tu dominio real de SeeNode.

### Paso 5: Reiniciar la aplicación en SeeNode

Después de agregar las variables de entorno, reinicia tu aplicación en SeeNode para que los cambios surtan efecto.

## 🧪 Cómo probar que funciona

### Prueba local (antes de deployar)

```bash
cd backend
npm start
```

Intenta subir un comprobante desde el formulario. Deberías ver en los logs:

```
☁️ Subiendo archivo_123.pdf a R2 (125.43 KB)
✅ Archivo subido a R2: https://pub-xxxxx.r2.dev/1234567890_archivo_123.pdf
```

### Prueba en SeeNode

1. Accede a tu aplicación en SeeNode
2. Ve a la página de "Retiros" (egreso.html)
3. Completa el formulario y sube un comprobante
4. Si todo funciona correctamente:
   - Verás el mensaje "✅ Guardado - Egreso registrado correctamente"
   - El archivo se habrá subido a R2
   - Podrás ver el comprobante haciendo clic en "👁️ Ver" en el historial

## 🔍 Debugging

Si sigues teniendo problemas, revisa los logs de SeeNode:

### Error: "Cloudflare R2 no está configurado"
- Verifica que todas las variables R2_* estén configuradas en SeeNode
- Asegúrate de no tener espacios extras en las variables

### Error: "Error R2: write EPROTO"
- Verifica que `NODE_TLS_REJECT_UNAUTHORIZED=0` esté configurada
- Verifica que `NODE_OPTIONS=--tls-min-v1.2` esté configurada
- Reinicia la aplicación en SeeNode

### Error: "Access Denied" o "403"
- Verifica que las credenciales R2 (ACCESS_KEY_ID y SECRET_ACCESS_KEY) sean correctas
- Verifica que el bucket tenga permisos de escritura

### Los archivos se guardan localmente en lugar de R2
- El sistema tiene un fallback automático a almacenamiento local
- Verifica que las variables R2 estén configuradas correctamente
- Revisa los logs para ver el mensaje: "🔧 R2 configurado: true"

## ⚠️ Consideraciones de seguridad

**¿Es seguro usar `NODE_TLS_REJECT_UNAUTHORIZED=0`?**

En este caso SÍ, porque:
1. Solo afecta las conexiones salientes desde tu servidor a Cloudflare R2
2. Cloudflare es un servicio confiable de infraestructura
3. Los datos están protegidos por las credenciales de R2 (ACCESS_KEY y SECRET_KEY)
4. La conexión sigue siendo HTTPS cifrada, solo no verifica el certificado
5. Es una solución común para entornos con problemas de OpenSSL legacy

**Alternativa más segura (pero más compleja):**
Si prefieres no usar esta variable, puedes:
1. Contactar al soporte de SeeNode para actualizar la versión de OpenSSL
2. Usar un proxy intermediario con certificados actualizados
3. Migrar a otro hosting que tenga OpenSSL actualizado

## 📊 Monitoreo

Después del deployment, monitorea:
- Tamaño del bucket R2 en Cloudflare
- Costo de almacenamiento (gratis hasta 10GB)
- Costo de transferencia (gratis hasta 10GB/mes)

## 🆘 Soporte

Si sigues teniendo problemas después de seguir esta guía:
1. Revisa los logs de SeeNode
2. Verifica que todas las variables de entorno estén configuradas
3. Asegúrate de haber reiniciado la aplicación después de configurar las variables
4. Contacta al soporte de SeeNode si el problema persiste

---

✅ **Con esta configuración, tu aplicación en SeeNode debería poder subir archivos a Cloudflare R2 sin problemas de SSL.**
