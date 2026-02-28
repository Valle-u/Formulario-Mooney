# Configuración de Monitoreo 24/7

Este documento explica cómo configurar el monitoreo del servidor para mantenerlo activo y recibir alertas si se cae.

## 1. Health Check Endpoint

Tu servidor ahora tiene un endpoint `/health` que verifica:
- ✅ Estado del servidor Node.js
- ✅ Conexión a la base de datos PostgreSQL
- ✅ Memoria utilizada
- ✅ Tiempo de actividad (uptime)

**URL del health check:**
```
https://tu-dominio.seenode.com/health
```

**Respuesta cuando todo está bien (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2026-01-05T12:00:00.000Z",
  "uptime": 3600,
  "database": "connected",
  "dbTime": "2026-01-05T12:00:00.000Z",
  "memory": {
    "used": 45,
    "total": 64
  }
}
```

**Respuesta cuando hay error (503 Service Unavailable):**
```json
{
  "status": "error",
  "timestamp": "2026-01-05T12:00:00.000Z",
  "uptime": 3600,
  "database": "disconnected",
  "error": "Connection refused"
}
```

---

## 2. Configurar UptimeRobot (Recomendado - GRATIS)

UptimeRobot es un servicio gratuito que hace ping a tu servidor cada 5 minutos y te envía alertas por email/SMS/Telegram si se cae.

### Pasos para configurar:

1. **Registrarse en UptimeRobot:**
   - Ir a: https://uptimerobot.com/
   - Hacer clic en "Sign Up Free"
   - Crear cuenta con tu email

2. **Agregar un nuevo monitor:**
   - Dashboard → "Add New Monitor"
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** MooneyMaker Production
   - **URL:** `https://tu-dominio.seenode.com/health`
   - **Monitoring Interval:** 5 minutes (gratis)
   - **Monitor Timeout:** 30 seconds
   - **HTTP Method:** GET
   - **HTTP Status Code:** 200

3. **Configurar alertas:**
   - En "Alert Contacts" agregar tu email
   - Opcional: Agregar Telegram, Slack, o SMS
   - Marcar "Alert when down"
   - Marcar "Alert when up" (para saber cuando se recupera)

4. **Verificar:**
   - El monitor debe mostrar "Up" (verde)
   - Deberías recibir un email de confirmación

### Plan Gratuito de UptimeRobot:
- ✅ 50 monitores
- ✅ Chequeo cada 5 minutos
- ✅ Alertas ilimitadas
- ✅ Monitoreo 24/7
- ✅ Historial de 60 días

---

## 3. Alternativa: Cron-job.org (También gratis)

Si preferís otra alternativa:

1. Ir a: https://cron-job.org/
2. Registrarse gratis
3. Crear nuevo cronjob:
   - **Title:** MooneyMaker Health Check
   - **URL:** `https://tu-dominio.seenode.com/health`
   - **Schedule:** Every 5 minutes
   - **Enable notifications:** Yes

---

## 4. Mejoras Implementadas en el Servidor

### A) PostgreSQL Connection Pool:
```javascript
// Configuración optimizada para mantener conexiones vivas
{
  keepAlive: true,                          // Mantener conexiones TCP vivas
  keepAliveInitialDelayMillis: 10000,      // Primer keepalive a los 10s
  allowExitOnIdle: false,                   // No cerrar el pool si está idle
  idleTimeoutMillis: 30000,                 // Cerrar conexiones idle después de 30s
  connectionTimeoutMillis: 5000,            // Timeout de conexión de 5s
  min: 2,                                   // Mínimo 2 conexiones siempre activas
  max: 10                                   // Máximo 10 conexiones
}
```

### B) Graceful Shutdown:
El servidor ahora maneja correctamente las señales del sistema operativo:
- `SIGTERM` → Shutdown limpio cuando Seenode reinicia el servidor
- `SIGINT` → Shutdown limpio cuando se presiona Ctrl+C
- `uncaughtException` → Logea el error y cierra limpiamente
- `unhandledRejection` → Logea el error pero NO cierra el servidor

### C) Event Handlers:
El pool de PostgreSQL ahora tiene listeners para:
- `error` → Logea errores de conexión sin terminar el proceso
- `connect` → Logea cuando se establece una nueva conexión
- `remove` → Logea cuando se remueve una conexión

---

## 5. Monitoreo de Logs en Seenode

### Ver logs en tiempo real:
```bash
# En el dashboard de Seenode, ir a tu servicio → Logs
```

### Logs importantes a buscar:

**Señales de salud:**
- ✅ `Nueva conexión establecida al pool de PostgreSQL`
- ✅ `API running on https://...`

**Señales de problemas:**
- ❌ `Error inesperado en el pool de PostgreSQL`
- ❌ `Health check failed`
- ❌ `Uncaught Exception`
- ❌ `Query lenta (>1000ms)`

---

## 6. Qué hacer si el servidor se cae

### Paso 1: Verificar el health check
```bash
curl https://tu-dominio.seenode.com/health
```

Si devuelve error 503 o timeout → El servidor o la DB están caídos.

### Paso 2: Revisar logs en Seenode
- Dashboard → Tu servicio → Logs
- Buscar mensajes de error cerca del momento de la caída

### Paso 3: Reiniciar manualmente (si es necesario)
- Dashboard → Tu servicio → Settings → "Restart Service"

### Paso 4: Verificar variables de entorno
- Asegurarse que DATABASE_URL, JWT_SECRET, etc. estén configuradas

---

## 7. Recomendaciones Adicionales

### Para máxima disponibilidad:

1. **Configurar auto-restart en Seenode:**
   - Verificar que "Auto Restart on Failure" esté habilitado
   - Configurar health check en Seenode para que reinicie automáticamente

2. **Backups automáticos de base de datos:**
   - Configurar backups diarios en Seenode
   - Mantener al menos 7 días de backups

3. **Escalabilidad:**
   - Si tenés más de 20-30 empleados usando simultáneamente:
     - Aumentar `PG_POOL_MAX` a 20
     - Considerar upgrade de recursos en Seenode

4. **Rate limiting:**
   - El servidor ya tiene rate limiting (5 intentos/5 min)
   - Esto previene ataques de fuerza bruta

---

## 8. Checklist de Verificación

Después de deployar estos cambios:

- [ ] El servidor arranca correctamente
- [ ] `/health` devuelve status 200
- [ ] La base de datos responde
- [ ] UptimeRobot está configurado y muestra "Up"
- [ ] Recibís alertas por email si el servidor se cae
- [ ] Los logs muestran "Nueva conexión establecida al pool"
- [ ] No hay errores de "Connection refused" en los logs

---

## Contacto de Soporte

Si seguís teniendo problemas después de implementar estas mejoras:

1. Revisar los logs de Seenode
2. Verificar que el plan Ultra esté activo
3. Contactar soporte de Seenode: help@seenode.com
4. Enviar detalles específicos: timestamp del error, logs, screenshots

---

**Última actualización:** 2026-01-05
