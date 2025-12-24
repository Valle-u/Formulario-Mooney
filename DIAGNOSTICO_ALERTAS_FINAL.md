# Diagnóstico Final - Sistema de Alertas

## Estado Actual

✅ **Confirmado:** Hay 3 alertas en la base de datos:
- Alerta #3: "Monto alto detectado" (critical, pending) - Creada hoy
- Alerta #2: "Posible transferencia duplicada - PRUEBA" (high, pending)
- Alerta #1: "Monto alto detectado - PRUEBA" (critical, pending)

✅ **Backend funcionando:** El servidor está corriendo en puerto 4000
✅ **Formularios funcionando:** Los egresos se guardan correctamente
✅ **Historial funcionando:** Los egresos se muestran correctamente

❌ **Problema:** Las alertas NO aparecen en la página de alertas

---

## 🔍 Instrucciones de Debugging

### Paso 1: Abrir la Consola

1. Abre: http://127.0.0.1:5500/frontend/public/alertas.html
2. Presiona **F12** (o clic derecho → Inspeccionar)
3. Ve a la pestaña **"Console"**

### Paso 2: Qué Logs Deberías Ver

Deberías ver en la consola (en este orden):

```
🚀 Inicializando página de alertas...
👤 Usuario: {username: "...", role: "admin", ...}
✅ Usuario es admin, continuando...
📊 Cargando datos...
🔍 Cargando alertas con filtros: {status: 'pending', severity: 'all'}
📡 URL: /api/alerts?limit=100&status=pending
✅ Respuesta del servidor: {alerts: Array(3), pagination: {...}}
📊 Alertas recibidas: 3
✅ Datos cargados exitosamente
```

### Paso 3: Identificar el Problema

#### CASO A: No ves NADA en la consola
**Problema:** La página no se está cargando correctamente
**Solución:** Revisa que estés logueado como admin

#### CASO B: Ves "❌ No autenticado"
**Problema:** No hay sesión activa
**Solución:**
1. Cierra la pestaña
2. Ve a http://127.0.0.1:5500/frontend/public/index.html
3. Loguéate como admin
4. Vuelve a abrir alertas.html

#### CASO C: Ves "⛔ Usuario no es admin"
**Problema:** Estás logueado como empleado, no como admin
**Solución:**
1. Sal (botón "Salir")
2. Loguéate con un usuario admin
3. Vuelve a intentar

#### CASO D: Ves error al cargar alertas
**Busca líneas como:**
```
❌ Error cargando alertas: ...
```

**Por favor copia TODO el error y repórtalo**

#### CASO E: Dice "📊 Alertas recibidas: 0"
**Problema:** El filtro está bloqueando las alertas

**Solución inmediata:**
1. En la página, cambia el filtro "ESTADO" de "Pendientes" a **"Todas"**
2. Haz clic en "Aplicar filtros"
3. ¿Ahora aparecen?

---

## 🎯 Pruebas Adicionales

### Si cambiar el filtro a "Todas" NO funciona:

1. **Abre la pestaña Network (Red) en DevTools**
2. **Recarga la página (F5)**
3. **Busca la petición a `/api/alerts`**
4. **Haz clic en ella**
5. **Ve a la pestaña "Response"**
6. **Copia TODO el JSON que ves ahí**

### Verificar que el endpoint funciona directamente:

Abre una nueva pestaña y ve a:
```
http://localhost:4000/api/alerts/stats
```

**¿Qué ves?**
- Si ves `{"message": "Token inválido"}` → Normal, necesitas estar logueado
- Si ves un JSON con números → El endpoint funciona
- Si ves error 404 → Problema con las rutas

---

## 🔧 Posibles Soluciones

### Solución 1: Limpiar caché y cookies
1. Presiona **Ctrl + Shift + Delete**
2. Selecciona "Cookies y datos de sitio"
3. Selecciona "Imágenes y archivos en caché"
4. Haz clic en "Borrar datos"
5. Cierra el navegador y vuelve a abrir
6. Loguéate de nuevo

### Solución 2: Usar otro navegador
- Si estás en Chrome, prueba en Firefox o Edge
- A veces los navegadores cachean JavaScript

### Solución 3: Verificar que app.js se cargó
En la consola, escribe:
```javascript
typeof api
```

**Debería decir:** `"function"`
**Si dice:** `"undefined"` → El archivo app.js no se cargó

---

## 📋 Información para Reportar

**Si nada funciona, por favor repórtame:**

1. **¿Qué logs ves en la consola?** (copia TODO)
2. **¿Qué aparece en la pestaña Network al buscar /api/alerts?**
3. **¿Qué navegador estás usando?** (Chrome, Firefox, Edge, etc.)
4. **¿Estás logueado como admin o empleado?**
5. **Captura de pantalla de la consola completa**

---

## 🎬 Video Guía

Si no te queda claro cómo abrir la consola:

1. **Chrome/Edge:** F12 o Ctrl+Shift+I
2. **Firefox:** F12 o Ctrl+Shift+K
3. **Safari:** Cmd+Option+I (Mac)

Luego busca la pestaña que dice "Console" o "Consola"

---

## ⚡ Solución Rápida de Emergencia

Si todo falla y necesitas ver las alertas YA, puedes usar SQL directamente:

```sql
SELECT
  id,
  title,
  message,
  severity,
  status,
  created_at
FROM alerts
ORDER BY created_at DESC;
```

Esto te mostrará todas las alertas que existen.

---

## 📞 Siguiente Paso

**Por favor haz esto AHORA:**

1. Abre http://127.0.0.1:5500/frontend/public/alertas.html
2. Abre la consola (F12)
3. Copia TODO lo que ves en la consola
4. Repórtamelo

Necesito ver exactamente qué logs aparecen para saber qué está fallando.
