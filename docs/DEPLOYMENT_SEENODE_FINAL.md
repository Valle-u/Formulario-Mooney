# 🚀 Deployment en SeeNode - Configuración Final

## ✅ Cambios Aplicados

El código ya está en GitHub con los siguientes cambios:

1. ✅ Cliente R2 con fetch() nativo implementado
2. ✅ Rutas actualizadas para usar el nuevo cliente
3. ✅ Credenciales de R2 actualizadas y verificadas
4. ✅ URL pública de R2 habilitada
5. ✅ Documentación completa incluida

**Commit**: `8929d4d` - "feat: Implementar cliente R2 con fetch API nativo para SeeNode"

---

## 📋 Configuración de Variables en SeeNode

Copia y pega estas variables en el panel de SeeNode:

### Variables Obligatorias

```bash
# Server (⚠️ CAMBIAR BASE_URL a tu dominio real de SeeNode)
PORT=4000
BASE_URL=https://tu-dominio.seenode.com
JWT_SECRET=aB3dEf9HiJkLmN0pQrStUvWxYz123457
CORS_ORIGIN=*

# Database (SeeNode te proporciona esto automáticamente)
DATABASE_URL=postgresql://usuario:password@host:puerto/database

# Cloudflare R2 - CREDENCIALES NUEVAS
R2_ACCOUNT_ID=5627e3f2c291921ace435f3cca4643c5
R2_ACCESS_KEY_ID=a32d1fec6becc2a4bb3170e931828b17
R2_SECRET_ACCESS_KEY=a4ee032ed0683151cF9v4e2f4dfb19b09b4e21a5b9eaa7aa46b6c2d6c8662826
R2_BUCKET_NAME=mooneymaker-formulario-premios-comprobantes
R2_PUBLIC_URL=https://pub-811d975ee99d4c5591deec5c1faadb54.r2.dev

# Uploads
UPLOAD_DIR=uploads
MAX_UPLOAD_MB=10

# Performance
MAX_PAGE_SIZE=200
FILE_RETENTION_MONTHS=12
AUDIT_RETENTION_MONTHS=6
PG_POOL_MIN=10
PG_POOL_MAX=40

# Admin inicial (⚠️ CAMBIAR el password a algo seguro)
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=CambiaEstoAAlgoMuySeguro123!
SEED_ADMIN_FULLNAME=Administrador
```

---

## ⚠️ IMPORTANTE: Variables que DEBES Cambiar

### 1. BASE_URL
Cambia `https://tu-dominio.seenode.com` a tu dominio real de SeeNode.

**Ejemplo**: Si tu app está en `https://mooneymaker.seenode.com`, usa:
```bash
BASE_URL=https://mooneymaker.seenode.com
```

### 2. SEED_ADMIN_PASSWORD
Cambia el password del admin a algo seguro:
```bash
SEED_ADMIN_PASSWORD=TuPasswordSuperSeguro2026!
```

### 3. DATABASE_URL
SeeNode te dará esta URL automáticamente cuando conectes la base de datos PostgreSQL.

---

## 🔍 Verificación Después del Deployment

### Paso 1: Revisar los Logs

En SeeNode, busca estos mensajes en los logs:

```
✅ Logs esperados (éxito):
📦 Storage configuration:
  - Mode: ☁️  Cloudflare R2 (Cloud)
  - Upload directory: uploads

✅ Configuración de R2 detectada
🚀 API running on https://tu-dominio.seenode.com
```

### Paso 2: Probar Subida de Comprobante

1. Accede a tu app en el navegador
2. Inicia sesión con admin/tu-password
3. Ve a "Retiros"
4. Crea una transferencia de prueba
5. Sube un comprobante (PDF/JPG/PNG)

**Si funciona, verás en los logs**:
```
☁️  Subiendo 1234567890_archivo.pdf a R2 (125.43 KB)...
✅ Archivo subido exitosamente a R2: https://pub-811d975ee99d4c5591deec5c1faadb54.r2.dev/1234567890_archivo.pdf
```

### Paso 3: Verificar el Comprobante

Haz clic en "👁️ Ver" en el historial de transferencias. El PDF debe abrirse correctamente.

---

## 🔧 Troubleshooting

### Error: "R2 no está configurado"
- Verifica que todas las variables R2_* estén en SeeNode
- Reinicia la aplicación

### Error: "HTTP 403: Access Denied"
- Las credenciales son incorrectas
- Verifica que copiaste correctamente el ACCESS_KEY_ID y SECRET_ACCESS_KEY
- Genera nuevas credenciales en Cloudflare si es necesario

### Error: "HTTP 404: Not Found"
- Verifica que R2_BUCKET_NAME sea exactamente: `mooneymaker-formulario-premios-comprobantes`

### Error: SSL handshake failure (en SeeNode)
**Esto NO debería pasar**, pero si pasa:
- Contacta al soporte de SeeNode
- Solicita actualización de Node.js/OpenSSL
- Como plan B temporal: comenta las variables R2 para usar almacenamiento local

### Los archivos se suben pero no se ven (404 al abrirlos)
- Verifica que R2_PUBLIC_URL sea correcto
- En Cloudflare R2, verifica que el bucket tenga acceso público habilitado:
  1. Settings → Public Access
  2. "Allow Access" debe estar activado

---

## 📊 Monitoreo Post-Deployment

### En Cloudflare R2

Revisa regularmente:
- **Storage usado**: R2 → Tu bucket → Metrics
- **Número de archivos**: Verifica que se estén subiendo correctamente
- **Costos**: R2 es gratis hasta 10GB storage + 10GB egress/mes

### En SeeNode

Monitorea:
- **Logs de aplicación**: Busca errores de R2
- **Performance**: Tiempo de subida de archivos
- **Errores 500**: Si hay muchos, revisa las credenciales

---

## ✅ Checklist Final

Antes de considerar el deployment completo:

- [ ] Código subido a GitHub (commit `8929d4d`)
- [ ] Variables de entorno configuradas en SeeNode
- [ ] BASE_URL cambiado a tu dominio real
- [ ] SEED_ADMIN_PASSWORD cambiado a algo seguro
- [ ] DATABASE_URL configurado (SeeNode lo da automáticamente)
- [ ] Deployment completado en SeeNode
- [ ] Logs revisados (sin errores de R2)
- [ ] Prueba de subida de comprobante exitosa
- [ ] Comprobante se puede visualizar correctamente
- [ ] URL pública de R2 funciona

---

## 🎉 ¡Éxito!

Si todos los pasos están completos:

✅ Tu aplicación está en production
✅ Los comprobantes se guardan en Cloudflare R2
✅ Todo funciona correctamente en SeeNode

**Próximos pasos**:
1. Compartir la URL con los usuarios
2. Monitorear el uso de R2
3. Configurar backups regulares de la base de datos

---

## 📚 Documentación Adicional

- `README_DEPLOYMENT.md` - Guía rápida de deployment
- `SOLUCION_FINAL_R2.md` - Explicación técnica completa
- `GENERAR_NUEVAS_CREDENCIALES.md` - Cómo regenerar credenciales si expiran

---

**¿Necesitas ayuda?**
- Revisa los logs de SeeNode
- Verifica que las variables estén correctamente configuradas
- Contacta al soporte de SeeNode si el problema persiste

¡Buena suerte con el deployment! 🚀
