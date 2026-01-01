# 🔐 Guía de Actualización de Seguridad

Esta guía te ayudará a aplicar las **5 mejoras críticas de seguridad** implementadas.

**IMPORTANTE**: Estas mejoras ya están codificadas en tu repositorio. Solo necesitás seguir los pasos de configuración y deployment.

---

## ⚡ Aplicación Rápida (5 minutos)

### 1. Actualizar Variables de Entorno

Editá tu archivo `.env` (o variables de entorno en SeeNode):

```bash
# ========== AGREGAR/MODIFICAR ==========

# JWT ahora expira en 1 hora (antes 12h)
# Asegurate que JWT_SECRET tenga mínimo 32 caracteres
JWT_SECRET=tu_secreto_super_largo_minimo_32_caracteres_aqui

# CORS Restrictivo (CRÍTICO en producción)
# Reemplazar con tu dominio real de SeeNode
CORS_ORIGIN=https://tu-app.seenode.com

# Modo producción
NODE_ENV=production

# Retención de audit logs (opcional, default 6 meses)
AUDIT_RETENTION_MONTHS=6
```

### 2. Ejecutar Migraciones

```bash
cd backend
npm start
```

Las migraciones se ejecutan automáticamente al iniciar. Verificá en la consola:

```
🔄 Ejecutando migraciones...
✅ Migración 012_add_refresh_tokens.sql aplicada
✅ Todas las migraciones completadas
```

### 3. Probar la Aplicación

1. Abrí la app en el navegador
2. Hacé login
3. Verificá en DevTools > Console que no haya errores
4. Dejá la sesión abierta por 1+ hora
5. Hacé una acción (debería renovar token automáticamente)

### 4. Configurar Limpieza Automática (Opcional)

**En SeeNode**:
- Ir a panel de control > Cron Jobs
- Crear nuevo cron:
  - Comando: `cd /ruta/al/proyecto/backend && node scripts/cleanup-audit-logs.js`
  - Frecuencia: Semanal, domingos 3 AM

**En servidor propio**:
```bash
cd backend
npm run cleanup:setup  # Linux/Mac
# O
powershell scripts/setup-task-windows.ps1  # Windows
```

---

## 🧪 Testing de las Mejoras

### Test 1: Refresh Token Funciona

1. Hacé login
2. Copiá el `refreshToken` de localStorage (DevTools > Application > Local Storage)
3. Esperá 1 hora (o cambiá temporalmente la expiración a 1 minuto para testing)
4. Hacé cualquier acción en la app
5. ✅ Debería funcionar sin pedir login de nuevo
6. Verificá en Console: `🔄 Renovando access token... ✅ Access token renovado`

### Test 2: CORS Funciona

1. Abrí DevTools > Console
2. Desde un sitio diferente, intentá hacer request:
   ```javascript
   fetch('https://tu-app.seenode.com/api/egresos', {
     headers: { 'Authorization': 'Bearer test' }
   })
   ```
3. ✅ Debería dar error CORS

### Test 3: CSP Funciona

1. Abrí la app
2. DevTools > Console
3. ✅ NO debería haber errores tipo:
   ```
   Refused to execute inline script because it violates CSP...
   ```
4. Intentá ejecutar:
   ```javascript
   eval('alert("test")')
   ```
5. ✅ Debería ser bloqueado por CSP

### Test 4: Logout Revoca Token

1. Hacé login en 2 navegadores diferentes
2. En navegador 1: Click en "Salir"
3. En navegador 2: Intentá hacer una acción
4. ✅ Debería seguir funcionando (solo se revocó el refresh token del navegador 1)

### Test 5: Limpieza de Logs

```bash
cd backend
npm run cleanup:dry
```

✅ Debería mostrar estadísticas sin eliminar nada:
```
📊 Estadísticas Actuales:
   • Total de logs: 1,234
   • Logs a eliminar: 0
   ...
```

---

## 🚨 Troubleshooting

### Error: "CORS not configured properly"

**Causa**: Variable `CORS_ORIGIN` no está configurada en `.env`

**Solución**:
```bash
# Agregar a .env
CORS_ORIGIN=https://tu-app.seenode.com
```

### Error: "Token expirado" cada hora

**Causa**: Refresh token no se está guardando correctamente

**Solución**:
1. Verificá que `app.js` actualizado esté deployado
2. Limpiá localStorage y volvé a hacer login
3. Verificá en DevTools > Application > Local Storage que exista `mm_refresh_token`

### Error: CSP blocks inline scripts

**Causa**: Hay scripts inline en algún HTML

**Solución**:
1. Buscá tags `<script>` en los archivos HTML
2. Movelos al archivo `app.js`
3. O temporalmente activá `unsafe-inline` hasta refactorizar:
   ```javascript
   scriptSrc: ["'self'", "'unsafe-inline'"]
   ```

### Error: Refresh token inválido

**Causa**: Tabla `refresh_tokens` no existe

**Solución**:
```bash
# Ejecutar migración manualmente
psql $DATABASE_URL -f backend/src/migrations/012_add_refresh_tokens.sql
```

---

## 📋 Checklist de Deployment

Antes de deployar a producción:

- [ ] ✅ `.env` configurado con:
  - [ ] `JWT_SECRET` único y fuerte (32+ caracteres)
  - [ ] `CORS_ORIGIN` con dominio real (sin `*`)
  - [ ] `NODE_ENV=production`

- [ ] ✅ Código actualizado:
  - [ ] `git pull` para obtener últimos cambios
  - [ ] Verificar que `backend/src/routes/auth.js` tiene endpoints de refresh

- [ ] ✅ Migraciones ejecutadas:
  - [ ] Tabla `refresh_tokens` existe en la DB
  - [ ] Verificar con: `psql $DATABASE_URL -c "\d refresh_tokens"`

- [ ] ✅ Frontend actualizado:
  - [ ] Archivo `app.js` tiene funciones de refresh token
  - [ ] Sin scripts inline en HTML

- [ ] ✅ Testing básico:
  - [ ] Login funciona
  - [ ] No hay errores en console
  - [ ] Logout funciona

- [ ] ✅ Limpieza configurada (opcional):
  - [ ] Cron job o scheduled task creado

---

## 🎯 Qué Cambió para el Usuario

### Experiencia del Usuario

**ANTES**:
- Login válido por 12 horas
- Después de 12h: "Sesión expirada, volvé a iniciar sesión"

**DESPUÉS**:
- Login válido por 7 días (con renovación automática)
- Cada hora se renueva el token automáticamente
- Después de 7 días sin usar: "Sesión expirada, volvé a iniciar sesión"

**Resultado**: ✅ Mejor UX (menos logins) + ✅ Más seguro (tokens de corta vida)

### Nueva Funcionalidad

- **"Cerrar sesión en todos los dispositivos"** (disponible para implementar):
  ```javascript
  // En app.js
  async function logoutAllDevices() {
    await api('/api/auth/logout-all', { method: 'POST' });
  }
  ```

---

## 📞 Soporte

Si tenés problemas aplicando las mejoras:

1. **Verificá los logs del servidor**:
   ```bash
   # Ver últimas 50 líneas
   tail -n 50 /ruta/al/proyecto/backend/logs/app.log
   ```

2. **Verificá la consola del navegador**:
   - DevTools > Console
   - Buscá mensajes de error en rojo

3. **Revisá la documentación**:
   - `docs/SECURITY_IMPROVEMENTS.md` - Detalles técnicos
   - `docs/CSP_IMPROVEMENT.md` - Info sobre CSP
   - `backend/.env.example` - Variables de entorno

4. **Rollback temporal** (si algo falla):
   ```bash
   git stash  # Guardar cambios
   git checkout HEAD~1  # Volver a versión anterior
   npm start  # Iniciar con versión anterior
   ```

---

## ✅ Confirmación de Éxito

Sabés que las mejoras están funcionando cuando:

1. ✅ Login funciona normalmente
2. ✅ No hay errores en DevTools > Console
3. ✅ Después de 1 hora, la app sigue funcionando sin pedir login
4. ✅ Al abrir desde otro dominio, da error CORS
5. ✅ En los logs del servidor ves:
   ```
   ✅ CORS: Permitido - https://tu-app.seenode.com
   🛡️ CSRF Protection: Validación de Origin/Referer activada
   🔄 Renovando access token...
   ✅ Access token renovado exitosamente
   ```

---

**¡Listo!** Tu aplicación ahora tiene seguridad de nivel enterprise 🎉

Si necesitás ayuda, revisá la documentación completa en `docs/SECURITY_IMPROVEMENTS.md`
