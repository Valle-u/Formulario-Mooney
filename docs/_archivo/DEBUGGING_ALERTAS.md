# Debugging - Sistema de Alertas

## Problemas Corregidos

### ✅ 1. Botones "Aplicar filtro" y "Actualizar" ahora están uno al lado del otro
- Agregado `display: flex; gap: 12px;` al contenedor de acciones

### 🔍 2. Badge muestra "2" pero no aparecen alertas en la página

**Estado actual en base de datos:**
```
Total alertas: 2
- Alerta #1: "Monto alto detectado - PRUEBA" (critical, pending)
- Alerta #2: "Posible transferencia duplicada - PRUEBA" (high, pending)
```

**Posibles causas:**
1. Error de autenticación al cargar
2. Filtros incorrectos
3. Error en el endpoint del API
4. Error de JavaScript en el navegador

## Instrucciones de Debugging

### Paso 1: Abrir Consola del Navegador

1. Abre http://127.0.0.1:5500/frontend/public/alertas.html
2. Presiona F12 para abrir DevTools
3. Ve a la pestaña "Console"

### Paso 2: Verificar Logs

Deberías ver en la consola:

```
🔍 Cargando alertas con filtros: {status: 'pending', severity: 'all'}
📡 URL: /api/alerts?limit=100&status=pending
✅ Respuesta del servidor: {alerts: Array(2), pagination: {...}}
📊 Alertas recibidas: 2
```

### Paso 3: Verificar Network

1. Ve a la pestaña "Network" en DevTools
2. Busca la petición a `/api/alerts?limit=100&status=pending`
3. Haz clic en ella
4. Ve a "Response" - deberías ver el JSON con las 2 alertas

### Paso 4: Si No Aparecen Alertas

**Opción A: Error 401 (No autorizado)**
- Cierra sesión y vuelve a iniciar sesión como admin
- Verifica que el token JWT no haya expirado

**Opción B: Filtro incorrecto**
- Cambia el filtro de "Estado" a "Todas"
- Haz clic en "Aplicar filtros"

**Opción C: Error de JavaScript**
- Verifica si hay errores en rojo en la consola
- Compártelos para diagnosticar

## Comandos SQL de Verificación

### Ver todas las alertas
```sql
SELECT id, title, status, severity, created_at
FROM alerts
ORDER BY created_at DESC;
```

### Ver estadísticas
```sql
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'acknowledged') as acknowledged,
  COUNT(*) FILTER (WHERE status = 'resolved') as resolved
FROM alerts;
```

### Cambiar estado de alertas de prueba (si quieres resetear)
```sql
UPDATE alerts SET status = 'pending' WHERE id IN (1, 2);
```

### Eliminar alertas de prueba
```sql
DELETE FROM alerts WHERE title LIKE '%PRUEBA%';
```

## Crear Alerta Real de Prueba

Para generar una alerta automática:

1. Ve a http://127.0.0.1:5500/frontend/public/egreso.html
2. Crea un egreso con:
   - Monto: **150000** (150 mil - supera el umbral de 100k)
   - Empresa: Cualquiera
   - Completa todos los campos requeridos
3. Envía el formulario
4. Debería crearse automáticamente una alerta de "Monto alto detectado"
5. El badge debería actualizarse a "3"
6. Ve a alertas.html y verifica que aparezca

## Testing de Transferencias Duplicadas

Para probar la detección de duplicados:

1. Crea un egreso de **$60,000** a "Telepagos"
2. Espera 2 minutos
3. Crea otro egreso de **$61,000** a "Telepagos" (dentro del ±5%)
4. Debería crearse una alerta de "Posible transferencia duplicada"
5. Badge debería mostrar +1 alerta

## Información Técnica

### Umbrales Configurados
- **Monto alto**: >= $100,000
  - Medium: $100k - $149k
  - High: $150k - $199k
  - Critical: >= $200k

- **Transferencias similares**: >= $50,000
  - Misma empresa
  - Monto ±5%
  - Ventana de 30 minutos
  - Medium: 1 similar
  - High: 2 similares
  - Critical: 3+ similares

### Endpoints API
```
GET  /api/alerts/stats         - Estadísticas (usado por badge)
GET  /api/alerts?status=...    - Listar alertas con filtros
POST /api/alerts/:id/acknowledge - Marcar como vista
POST /api/alerts/:id/resolve    - Resolver con notas
```

### Solución Rápida

Si nada funciona, ejecuta esto en la base de datos para verificar que los datos están bien:

```sql
-- Ver estructura completa de una alerta
SELECT * FROM alerts WHERE id = 1;

-- Ver configuración de alertas
SELECT * FROM alert_config ORDER BY alert_type;

-- Ver triggers activos
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'egresos'::regclass
  AND tgname LIKE 'trg_%';
```
