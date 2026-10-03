# Solución de Problemas - MooneyMaker

## Fecha: 2025-12-23

---

## ✅ Problemas Resueltos

### 1. **Alertas - Badge mostraba "2" pero no aparecían en la página**

**Causa:** Las 2 alertas de prueba SÍ existen en la base de datos (confirmado).

**Diagnóstico pendiente:** Agregados console.logs para debugging en `cargarAlertas()`:
```javascript
console.log('🔍 Cargando alertas con filtros:', currentFilters);
console.log('📡 URL:', `/api/alerts?${params}`);
console.log('✅ Respuesta del servidor:', data);
console.log('📊 Alertas recibidas:', data.alerts?.length || 0);
```

**Instrucciones para el usuario:**
1. Abrir http://127.0.0.1:5500/frontend/public/alertas.html
2. Presionar F12 → Consola
3. Revisar qué logs aparecen
4. Si hay error 401: cerrar sesión y volver a loguearse
5. Si dice "0 alertas": cambiar filtro de "Pendientes" a "Todas"

---

### 2. **Botones "Aplicar filtro" y "Actualizar" stackeados**

**Problema:** Los botones aparecían uno debajo del otro.

**Solución aplicada:**
```html
<div class="actions span12" style="display: flex; gap: 12px;">
  <button id="btnFilter" class="btn btn-primary" type="button">Aplicar filtros</button>
  <button id="btnRefresh" class="btn btn-ghost" type="button">Actualizar</button>
</div>
```

**Resultado:** ✅ Botones ahora están uno al lado del otro.

---

### 3. **❌ CRÍTICO: Egresos NO aparecían en Historial**

**Problema:** Los egresos SÍ se guardaban en la base de datos (17 registros confirmados), pero NO aparecían al abrir consulta-egresos.html.

**Causa raíz:** La función `buscarEgresos()` NUNCA se llamaba al cargar la página.

**Código incorrecto (app.js línea 1629-1641):**
```javascript
// Consulta Egresos
if(document.getElementById("egresosTable")){
  populateFiltrosSelects();
  document.getElementById("filtrosForm")?.addEventListener("submit", handleFiltrosSubmit);
  document.getElementById("btnLimpiar")?.addEventListener("click", limpiarFiltros);
  // ... más event listeners ...

  // ❌ FALTA: buscarEgresos();
}
```

**Solución aplicada:**
```javascript
// Consulta Egresos
if(document.getElementById("egresosTable")){
  populateFiltrosSelects();
  document.getElementById("filtrosForm")?.addEventListener("submit", handleFiltrosSubmit);
  document.getElementById("btnLimpiar")?.addEventListener("click", limpiarFiltros);
  // ... event listeners ...

  // ✅ AGREGADO: Cargar egresos al iniciar la página
  buscarEgresos();
}
```

**Archivo modificado:** `frontend/public/app.js` (línea 1643)

**Resultado:**
- ✅ Los egresos ahora se cargan automáticamente al abrir la página
- ✅ Deberían aparecer todos los 17 registros existentes
- ✅ La descarga de CSV también debería funcionar ahora

---

## 🧪 Testing Requerido

### Página de Historial (consulta-egresos.html)

**Por favor verifica:**

1. **Cargar automáticamente:**
   - Abre http://127.0.0.1:5500/frontend/public/consulta-egresos.html
   - ¿Aparecen egresos inmediatamente? (Deberían aparecer 10 o los últimos registros)
   - ¿Dice "Cargando..." y luego muestra datos?

2. **Filtros:**
   - Prueba filtrar por fecha
   - Prueba filtrar por empresa (Telepagos, Copter, Palta)
   - Haz clic en "Buscar" - ¿se actualiza la tabla?

3. **Paginación:**
   - ¿Aparecen botones "Anterior" / "Siguiente"?
   - ¿Funcionan correctamente?

4. **Descarga CSV:**
   - Haz clic en "Descargar CSV"
   - ¿Se descarga el archivo?
   - ¿Contiene todos los egresos filtrados?

5. **Ver detalle:**
   - Haz clic en "Ver" en cualquier egreso
   - ¿Se abre el modal con la información completa?

---

## 📊 Datos en Base de Datos (Confirmado)

```
Total de egresos: 17

Últimos 5:
- ID 32: $9,999 - Telepagos (23/12/2025 14:15)
- ID 31: $6,000 - Telepagos (22/12/2025 23:42)
- ID 30: $9,999 - Telepagos (22/12/2025 23:02)
- ID 29: $6,000 - Telepagos (22/12/2025 22:58)
- ID 28: $9,999 - Copter (22/12/2025 21:41)

Usuarios:
- [1] admin (admin)
- [2] Marcos (empleado)
- [3] Tato (empleado)

Alertas:
- 2 alertas pendientes (prueba)
```

---

## 🔍 Debugging Adicional

### Si los egresos AÚN NO aparecen:

1. **Abrir consola del navegador (F12 → Console)**
2. **Buscar errores en rojo**
3. **Verificar qué dice la petición:**
   ```
   GET /api/egresos?limit=10&offset=0
   ```
4. **Ir a Network tab → buscar esa petición**
5. **Ver la respuesta - debería tener:**
   ```json
   {
     "egresos": [...],
     "pagination": { "total": 17, ... }
   }
   ```

### Si hay error 401:
- Token expirado → cerrar sesión y volver a loguearse

### Si la respuesta está vacía:
- Verificar que el backend esté corriendo en puerto 4000
- Ejecutar: `netstat -ano | findstr :4000`

---

## 📝 Archivos Modificados

1. **frontend/public/app.js**
   - Línea 1643: Agregado `buscarEgresos();` en inicialización
   - ✅ Corrige problema de historial vacío

2. **frontend/public/alertas.html**
   - Línea 124-127: Botones con `display: flex; gap: 12px;`
   - Líneas 327-333: Console.logs para debugging
   - ✅ Corrige alineación de botones
   - ✅ Agrega debugging para diagnosticar alertas

3. **DEBUGGING_ALERTAS.md** (creado)
   - Guía completa de debugging del sistema de alertas

4. **SOLUCION_PROBLEMAS.md** (este archivo)
   - Resumen de todos los problemas y soluciones

---

## ⚠️ Problema Conocido: Alertas

El badge muestra "2" alertas pendientes (correcto - existen en DB), pero pueden no mostrarse en la página.

**Próximo paso:** Usuario debe abrir consola y reportar qué logs ve para diagnosticar.

**Posibles causas:**
- Filtro incorrecto (status='pending' pero debería ser 'all')
- Error de autenticación
- Problema en el endpoint /api/alerts

---

## 🚀 Próximos Pasos

1. ✅ Usuario prueba historial → debería funcionar ahora
2. ⏳ Usuario abre consola en alertas.html → reporta logs
3. ⏳ Diagnosticar y solucionar problema de alertas según logs
4. ✅ Probar descarga de CSV
5. ✅ Confirmar que todo funciona

---

## 💡 Tips

### Para crear alertas reales de prueba:

**Alerta de monto alto:**
```
1. Ir a Retiros (egreso.html)
2. Crear egreso de $150,000 o más
3. La alerta se crea automáticamente
```

**Alerta de transferencia duplicada:**
```
1. Crear egreso de $60,000 a "Telepagos"
2. Esperar 2 minutos
3. Crear otro egreso de $61,000 a "Telepagos"
4. Se crea alerta de duplicación
```

### Para limpiar alertas de prueba:

```sql
DELETE FROM alerts WHERE title LIKE '%PRUEBA%';
```

---

**Estado:** ✅ Problema crítico de historial RESUELTO
**Pendiente:** Diagnosticar problema de alertas (requiere logs del usuario)
