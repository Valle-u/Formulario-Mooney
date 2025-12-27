# Guía de Testing - MooneyMaker

Esta guía te ayudará a verificar que todas las mejoras de seguridad funcionan correctamente.

## Pre-requisitos

1. Backend corriendo:
   ```bash
   cd backend
   npm start
   ```
   Deberías ver:
   ```
   🔧 Running database migrations...
   ✅ Database migrations finished
   API running on http://localhost:4000
   ```

2. Frontend servido (por ejemplo con Live Server en VSCode)

---

## Testing Automatizado ✅ COMPLETADO

Las siguientes pruebas ya fueron ejecutadas y pasaron:

- ✅ Servidor arranca sin errores
- ✅ Login funciona correctamente
- ✅ Middleware de autenticación valida tokens
- ✅ Headers de seguridad están activos
- ✅ Rate limiting configurado

Ver detalles en: `docs/REPORTE_TESTING_SEGURIDAD.md`

---

## Testing Manual (Requiere Navegador)

### 1. API_BASE Auto-Detectada

**Objetivo**: Verificar que el frontend detecta automáticamente la URL del backend

**Pasos**:
1. Abre `http://localhost:5500` (o tu puerto de Live Server)
2. Abre DevTools (F12) → Console
3. **Verifica** que aparezca el mensaje:
   ```
   🔌 API_BASE: http://localhost:4000
   ```
4. Intenta hacer login con `admin` / `admin123`
5. **Verifica** que el login funcione (no debería haber error de CORS)

**Resultado esperado**: ✅ Login exitoso sin errores de red

---

### 2. Confirmación de Contraseña

**Objetivo**: Verificar validación visual de coincidencia de contraseñas

**Pasos**:
1. Inicia sesión como `admin` / `admin123`
2. Ve a la página **Usuarios** (`usuarios.html`)
3. En la sección "Crear usuario", completa:
   - Username: `test_usuario`
   - Password: `Test1234!`
   - Confirmar Password: `Test1234!` (exactamente igual)

4. **Verifica** el indicador debajo de "Confirmar Password":
   ```
   ✓ Las contraseñas coinciden
   ```
   Debería estar en **VERDE**

5. Ahora cambia el campo "Confirmar Password" a: `Test1234@` (diferente)
6. **Verifica** que el indicador cambie a:
   ```
   ✗ Las contraseñas NO coinciden
   ```
   Debería estar en **ROJO**

7. Haz clic en "Crear" con contraseñas diferentes
8. **Verifica** que aparezca el toast:
   ```
   ⚠ Contraseñas no coinciden
   Las contraseñas deben ser idénticas
   ```

9. Corrige las contraseñas para que coincidan y crea el usuario
10. **Verifica** que se cree exitosamente

**Resultado esperado**: ✅ Validación visual funciona, usuario solo se crea si coinciden

---

### 3. Timeout de Sesión por Inactividad

**Objetivo**: Verificar que la sesión expira después de 30 minutos de inactividad

#### OPCIÓN A: Test Rápido (Modificando Timeout)

**Solo para testing, NO dejar en producción**

1. Edita `frontend/public/app.js` línea ~117:
   ```javascript
   // TEMPORAL - Solo para testing
   const INACTIVITY_TIMEOUT_MS = 1 * 60 * 1000; // 1 minuto
   const WARNING_BEFORE_LOGOUT_MS = 10 * 1000; // 10 segundos antes
   ```

2. Guarda y recarga la página
3. Inicia sesión
4. Abre DevTools → Console
5. **Verifica** el mensaje:
   ```
   🔒 Monitor de inactividad activado (timeout: 30 min)
   ```

6. **NO TOQUES NADA** (ni mouse, ni teclado, ni scroll)
7. Espera **50 segundos**
8. **Verifica** que aparezca el toast:
   ```
   ⚠️ Inactividad
   Tu sesión expirará en 2 minutos por inactividad
   ```

9. Sigue sin tocar nada por **10 segundos más**
10. **Verifica** que a los 60 segundos:
    - Aparezca toast: `⏱️ Sesión expirada - Tu sesión ha expirado por inactividad`
    - Te redirija a `index.html` (página de login)
    - localStorage esté vacío (verifica en DevTools → Application → Local Storage)

11. **IMPORTANTE**: Restaura los valores originales en `app.js`:
    ```javascript
    const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
    const WARNING_BEFORE_LOGOUT_MS = 2 * 60 * 1000; // 2 minutos antes
    ```

**Resultado esperado**: ✅ Sesión expira automáticamente después del timeout

#### OPCIÓN B: Test Completo (30 minutos reales)

Solo si tienes tiempo:
1. Inicia sesión
2. Deja la pestaña abierta sin tocar nada
3. A los 28 minutos, deberías ver el warning
4. A los 30 minutos, deberías ser deslogueado

---

### 4. Validación Real de MIME Types

**Objetivo**: Verificar que no se pueden subir archivos maliciosos disfrazados

#### Preparación: Crear Archivo de Prueba

**En Windows**:
```cmd
copy C:\Windows\notepad.exe malware_test.jpg
```

**En Linux/Mac**:
```bash
cp /bin/ls malware_test.jpg
```

Esto crea una copia de un ejecutable con extensión `.jpg`

#### Test de Rechazo

1. Inicia sesión como admin o empleado
2. Ve a **Retiros** (`egreso.html`)
3. Completa el formulario de egreso:
   - Selecciona cualquier concepto
   - Completa fecha, hora, turno
   - Completa monto, cuentas, etc
   - En "SUBIR ARCHIVO COMPROBANTE", selecciona `malware_test.jpg`

4. Haz clic en "Guardar"
5. **Verifica** que aparezca un error (puede tardar unos segundos):
   ```
   ❌ Error
   Tipo de archivo no permitido: application/x-msdownload
   ```
   O similar (el mensaje puede variar)

6. **Verifica** que el archivo NO se haya guardado

**Resultado esperado**: ✅ Archivo malicioso rechazado

#### Test de Aceptación

Ahora prueba con archivos válidos:

1. Crea o descarga:
   - Una imagen JPG real
   - Una imagen PNG real
   - Un PDF real

2. Sube cada uno como comprobante (completando el formulario)
3. **Verifica** que se acepten sin problemas

**Resultado esperado**: ✅ Archivos válidos aceptados

---

### 5. Headers de Seguridad

**Objetivo**: Verificar que los headers HTTP están presentes

1. Abre DevTools (F12) → Network
2. Recarga la página
3. Haz clic en cualquier request al backend (por ejemplo, `/api/auth/login`)
4. Ve a la pestaña "Headers"
5. **Verifica** que aparezcan los siguientes headers en la **Response**:

```
Content-Security-Policy: default-src 'self';...
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

**Resultado esperado**: ✅ Headers de seguridad presentes

---

## Checklist Completo

### Backend
- [x] Servidor arranca sin errores
- [x] Migraciones ejecutadas
- [x] Login funciona
- [x] Token JWT válido
- [x] Headers de seguridad
- [x] Rate limiting activo

### Frontend - Testing Manual
- [ ] API_BASE se detecta automáticamente
- [ ] Confirmación de contraseña funciona
- [ ] Indicador visual de coincidencia funciona
- [ ] Timeout de sesión expira correctamente
- [ ] Advertencia de timeout aparece
- [ ] Validación MIME rechaza ejecutables
- [ ] Validación MIME acepta JPG/PNG/PDF
- [ ] Headers visibles en DevTools

---

## Troubleshooting

### Problema: "EADDRINUSE: address already in use :::4000"

**Solución**:
```bash
# Windows
netstat -ano | findstr :4000
taskkill //PID <PID> //F

# Linux/Mac
lsof -ti:4000 | xargs kill -9
```

### Problema: "Cannot find module 'file-type'"

**Solución**:
```bash
cd backend
npm install
```

### Problema: Frontend no se conecta al backend

**Verifica**:
1. Backend corriendo en puerto 4000
2. Frontend en puerto diferente (ej: 5500)
3. CORS configurado correctamente
4. Console del navegador para ver `API_BASE: http://localhost:4000`

### Problema: No aparece mensaje de timeout

**Verifica**:
1. Estás en una página protegida (no en login)
2. Abre DevTools → Console
3. Busca errores de JavaScript
4. Verifica que `setupInactivityMonitor()` se llame

---

## Resultados Esperados - Resumen

| Feature | Estado | Test Manual |
|---------|--------|-------------|
| Servidor | ✅ PASS | No requerido |
| Login/Auth | ✅ PASS | No requerido |
| Headers | ✅ PASS | Opcional (DevTools) |
| API_BASE | ⏳ PENDIENTE | **Requerido** |
| Confirmación Password | ⏳ PENDIENTE | **Requerido** |
| Timeout Sesión | ⏳ PENDIENTE | **Requerido** |
| Validación MIME | ⏳ PENDIENTE | **Requerido** |

---

## Reportar Issues

Si encuentras algún problema durante el testing:

1. **Captura de pantalla** del error
2. **Console logs** (DevTools → Console)
3. **Network logs** (DevTools → Network)
4. **Pasos exactos** para reproducir

Guarda esta información para debugging.

---

## Siguiente Paso

Después de completar todos los tests manuales:
1. Marca los items en el checklist
2. Si todo pasa: ✅ **Listo para producción**
3. Si hay issues: 🔧 Reportar y corregir

---

**Última actualización**: 2025-12-24
