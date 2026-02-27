# 🚀 Deployment en SeeNode - Solución Final

## 📝 Resumen

Después de investigar el problema SSL con Cloudflare R2, la **solución más simple y confiable** es usar **almacenamiento local** en SeeNode. SeeNode tiene almacenamiento persistente, por lo que tus archivos se mantendrán seguros.

## ✅ Solución Implementada: Almacenamiento Local

Tu aplicación ya está configurada para usar almacenamiento local automáticamente cuando R2 no está configurado. Esto funciona perfectamente en SeeNode.

### Ventajas del almacenamiento local en SeeNode:
- ✅ **Cero configuración**: No necesitas configurar credenciales externas
- ✅ **Sin costos adicionales**: No pagas por R2
- ✅ **Más rápido**: Los archivos se sirven directamente desde tu servidor
- ✅ **Sin problemas SSL**: No depende de conexiones externas
- ✅ **Persistente**: SeeNode mantiene tus archivos aunque reinicies el servidor

### Desventajas (mínimas para tu caso de uso):
- ⚠️ Limitado al almacenamiento de SeeNode (generalmente 10-20GB, suficiente para PDFs/imágenes)
- ⚠️ Backups manuales (puedes usar el script `backup-database.js` para respaldar)

---

## 🔧 Configuración en SeeNode

### Paso 1: Variables de Entorno Obligatorias

Configura las siguientes variables en el panel de SeeNode:

```bash
# Server
PORT=4000
BASE_URL=https://tu-dominio.seenode.com
JWT_SECRET=aB3dEf9HiJkLmN0pQrStUvWxYz123457

# CORS - Cambia esto a tu dominio frontend si es diferente
CORS_ORIGIN=*

# Postgres (SeeNode te dará esta URL automáticamente)
DATABASE_URL=postgresql://usuario:password@host:puerto/database

# Uploads - Almacenamiento LOCAL
UPLOAD_DIR=uploads
MAX_UPLOAD_MB=10

# Performance
MAX_PAGE_SIZE=200
FILE_RETENTION_MONTHS=12
AUDIT_RETENTION_MONTHS=6

# Pool de conexiones
PG_POOL_MIN=10
PG_POOL_MAX=40

# Admin inicial
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=TuPasswordSegura123
SEED_ADMIN_FULLNAME=Administrador
```

### Paso 2: Configurar BASE_URL correctamente

⚠️ **MUY IMPORTANTE**: Cambia `BASE_URL` a tu dominio real de SeeNode.

Si tu app está en `https://mooneymaker.seenode.com`, configura:
```bash
BASE_URL=https://mooneymaker.seenode.com
```

Esto es necesario para que las URLs de los comprobantes se generen correctamente.

### Paso 3: Deployment

1. Sube tu código a GitHub (si no lo has hecho)
2. Conecta tu repositorio con SeeNode
3. SeeNode detectará automáticamente que es un proyecto Node.js
4. El comando de inicio es: `npm start` (ya configurado en package.json)

### Paso 4: Verificar que funciona

Después del deployment:

1. Accede a tu app en el navegador
2. Inicia sesión con las credenciales del admin
3. Ve a "Retiros" y crea una transferencia de prueba
4. Sube un comprobante (PDF/JPG/PNG)
5. Si todo funciona:
   - Verás el mensaje "✅ Guardado - Egreso registrado correctamente"
   - El archivo se guardó en `uploads/` en tu servidor SeeNode
   - Podrás ver el comprobante haciendo clic en "👁️ Ver"

---

## 🔍 Debugging

### Los archivos no se guardan

Verifica en los logs de SeeNode que veas este mensaje:
```
💾 Guardando localmente en: uploads/1234567890_archivo.pdf
✅ Comprobante guardado localmente
```

Si no ves este mensaje, verifica:
- Que `UPLOAD_DIR=uploads` esté configurado
- Que `BASE_URL` apunte a tu dominio real de SeeNode

### Error al ver comprobantes

Si al hacer clic en "👁️ Ver" ves un error 404:
- Verifica que `BASE_URL` esté configurado correctamente
- Los comprobantes se sirven desde `https://tu-dominio.seenode.com/uploads/archivo.pdf`

### Los archivos desaparecen al reiniciar

Esto NO debería pasar en SeeNode. Si pasa:
- Verifica que la carpeta `uploads/` esté en la raíz del proyecto
- Contacta al soporte de SeeNode para verificar la persistencia del almacenamiento

---

## 🔄 Migración futura a R2 (Opcional)

Si en el futuro quieres migrar a Cloudflare R2:

### Opción A: Esperar a que SeeNode actualice OpenSSL

Si SeeNode actualiza su versión de Node.js/OpenSSL, puedes intentar habilitar R2 de nuevo.

### Opción B: Usar un proxy intermediario

Podrías configurar un proxy (como Cloudflare Workers) que:
1. Reciba los archivos desde SeeNode
2. Los suba a R2 sin problemas SSL
3. Devuelva la URL pública

### Opción C: Contactar a Cloudflare Support

Es posible que tus credenciales de R2 estén incorrectas o hayan expirado. Contacta a Cloudflare para:
1. Verificar que las credenciales sean correctas
2. Generar nuevas credenciales si es necesario
3. Verificar que el bucket tenga los permisos correctos

---

## 📊 Monitoreo

### Espacio en disco

Monitorea el uso de espacio en SeeNode. Si subes muchos archivos (cientos por día), considera:
- Comprimir PDFs antes de subirlos
- Implementar limpieza automática de archivos antiguos (el script ya está en `backend/scripts/cleanup-old-files.js`)

### Backups

Para respaldar tus archivos:

```bash
# Desde tu máquina local (con acceso SSH a SeeNode):
scp -r usuario@seenode:/ruta/a/tu/app/uploads ./backup-uploads-$(date +%Y%m%d)
```

O configura un backup automático usando el script de backup de la base de datos (también puede incluir archivos).

---

## ✅ Resumen de lo que funciona AHORA

Con la configuración actual (almacenamiento local):

✅ Subir comprobantes (PDF/JPG/PNG hasta 10MB)
✅ Ver comprobantes desde el historial
✅ Descargar comprobantes
✅ Persistencia de archivos entre reinicios
✅ Sin costos adicionales
✅ Sin problemas de SSL/TLS
✅ Funciona en SeeNode sin configuración extra

---

## 🆘 Soporte

Si tienes problemas:
1. Revisa los logs de SeeNode para ver errores específicos
2. Verifica que todas las variables de entorno estén configuradas
3. Asegúrate de haber reiniciado la aplicación después de cambiar variables
4. Si el problema persiste, contacta al soporte de SeeNode

---

**¡Listo para deployar!** 🎉

Tu aplicación funcionará perfectamente en SeeNode con almacenamiento local. Si en el futuro necesitas migrar a R2, podrás hacerlo cuando el problema SSL esté resuelto.
