# Cambios Implementados - Sistema de Alertas

## Fecha: 2025-12-23

---

## 🔧 Problemas Solucionados

### 1. Modal de Alertas se Mostraba Automáticamente
**Problema:** Al entrar a `alertas.html`, el modal de "Resolver Alerta" aparecía automáticamente bloqueando la interfaz.

**Solución:**
- Agregado `style="display: none;"` al modal en `alertas.html`
- Cambiado de usar clase `.show` a modificar directamente `display` en funciones JS
- Funciones actualizadas:
  - `mostrarModalResolver()`: usa `style.display = 'flex'`
  - `cerrarModalResolver()`: usa `style.display = 'none'`

**Archivos modificados:**
- `frontend/public/alertas.html` - líneas 422, 727, 731

---

## 📊 Configuración de Alertas Actualizada

### 2. Umbrales de Montos Ajustados

#### A) Monto Alto (high_amount_egreso)
**Antes:** $50,000
**Ahora:** $100,000

**Razón:** Ajuste para reducir falsos positivos y enfocarse en montos realmente significativos.

**Severidades:**
- **Critical:** Monto >= $200,000 (2x umbral)
- **High:** Monto >= $150,000 (1.5x umbral)
- **Medium:** Monto >= $100,000 (umbral base)

---

### 3. Nueva Alerta: Detección de Transferencias Duplicadas/Sospechosas

#### Tipo: `similar_transfers_short_time`

**Descripción:** Detecta transferencias similares que podrían ser duplicaciones o actividad sospechosa.

**Criterios de Detección:**
- Monto mínimo: **$50,000**
- Misma empresa de salida
- Monto dentro del **±5%** del monto original
- Ventana de tiempo: **30 minutos**

**Ejemplo:**
Si se crea un egreso de $55,000 a Telepagos, el sistema busca:
- Otros egresos a Telepagos
- Creados en los últimos 30 minutos
- Con monto entre $52,250 y $57,750 (55k ± 5%)

**Severidades:**
- **Critical:** 3+ transferencias similares
- **High:** 2 transferencias similares
- **Medium:** 1 transferencia similar

**Metadata incluida en la alerta:**
```json
{
  "monto": 55000,
  "empresa_salida": "Telepagos",
  "id_transferencia": "ABC123",
  "similar_count": 2,
  "time_window_minutes": 30,
  "recent_transfers": [
    {
      "id": 42,
      "monto": 55500,
      "created_at": "2025-12-23T14:25:00",
      "id_transferencia": "ABC122"
    },
    {
      "id": 41,
      "monto": 54800,
      "created_at": "2025-12-23T14:20:00",
      "id_transferencia": "ABC121"
    }
  ],
  "etiqueta": "Premio Pagado"
}
```

---

## 🗄️ Cambios en Base de Datos

### Migración 008: `008_update_alert_thresholds_and_duplicate_detection.sql`

**Cambios aplicados:**

1. **UPDATE** `alert_config`:
   - `high_amount_egreso` threshold: 50000 → 100000

2. **INSERT** nueva configuración:
   ```sql
   alert_type: 'similar_transfers_short_time'
   threshold_value: 50000
   config_json: {
     "time_window_minutes": 30,
     "amount_tolerance_percent": 5,
     "notify_roles": ["admin"]
   }
   ```

3. **FUNCTION** creada: `check_similar_transfers_alert()`
   - Trigger automático en INSERT de egresos
   - Busca transferencias similares en ventana de tiempo
   - Crea alerta si detecta coincidencias

4. **TRIGGER** creado: `trg_check_similar_transfers`
   - Se ejecuta AFTER INSERT en tabla `egresos`
   - Llama a `check_similar_transfers_alert()`

5. **ÍNDICES** agregados para performance:
   ```sql
   idx_egresos_empresa_created ON egresos(empresa_salida, created_at DESC, status)
   idx_egresos_monto_created ON egresos(monto, created_at DESC)
   ```

---

## 📋 Configuración Final de Alertas

### Resumen de Todas las Alertas Configuradas:

| Tipo de Alerta | Umbral | Configuración | Estado |
|----------------|--------|---------------|--------|
| **high_amount_egreso** | $100,000 | Monto alto | ✅ Activo + Trigger |
| **similar_transfers_short_time** | $50,000 | 30 min, ±5% | ✅ Activo + Trigger |
| **multiple_egresos_short_time** | 5 egresos | 10 minutos | ⚠️ Configurado (sin trigger) |
| **unusual_hour** | N/A | 08:00-20:00 | ⚠️ Configurado (sin trigger) |
| **duplicate_id_transferencia** | N/A | ID duplicado | ⚠️ Configurado (sin trigger) |

**Nota:** Solo `high_amount_egreso` y `similar_transfers_short_time` tienen triggers automáticos implementados.

---

## 🧪 Casos de Prueba

### Escenario 1: Monto Alto
**Acción:** Crear egreso de $120,000
**Resultado esperado:**
- ✅ Alerta creada: "Monto alto detectado"
- Severidad: Medium
- Badge de alertas se actualiza en navegación

### Escenario 2: Transferencia Duplicada
**Acción:**
1. Crear egreso: $60,000 a Telepagos a las 14:00
2. Crear egreso: $61,000 a Telepagos a las 14:15

**Resultado esperado:**
- ✅ Alerta creada en el segundo egreso: "Posible transferencia duplicada"
- Severidad: Medium
- Metadata incluye referencia al primer egreso
- Badge muestra 2 alertas (monto alto + duplicada)

### Escenario 3: Múltiples Duplicadas
**Acción:**
1. Crear egreso: $55,000 a Copter a las 10:00
2. Crear egreso: $55,500 a Copter a las 10:10
3. Crear egreso: $54,800 a Copter a las 10:20

**Resultado esperado:**
- ✅ Alerta en egreso #2: Severidad Medium (1 similar)
- ✅ Alerta en egreso #3: Severidad High (2 similares)

### Escenario 4: Fuera de Ventana de Tiempo
**Acción:**
1. Crear egreso: $52,000 a Palta a las 09:00
2. Crear egreso: $52,500 a Palta a las 09:45 (45 minutos después)

**Resultado esperado:**
- ❌ NO se crea alerta de duplicación (> 30 minutos)
- ✅ Solo alertas de monto alto si aplica

---

## 🎯 Beneficios

1. **Reducción de Ruido:**
   - Umbral de $100k elimina alertas innecesarias de montos medios
   - Foco en transacciones realmente significativas

2. **Detección de Fraude:**
   - Identificación automática de posibles duplicaciones
   - Alertas tempranas sobre patrones sospechosos
   - Metadata completa para investigación

3. **Performance Optimizado:**
   - Índices en columnas clave (empresa, monto, fecha)
   - Búsquedas eficientes en ventanas de tiempo
   - Triggers ejecutan solo en INSERT

4. **Flexibilidad:**
   - Configuración editable en tabla `alert_config`
   - Fácil ajuste de umbrales sin cambiar código
   - Posibilidad de habilitar/deshabilitar alertas

---

## 🔍 Monitoreo

### Dashboard de Alertas
**URL:** `http://localhost:5500/frontend/public/alertas.html`

**Funcionalidades:**
- Ver todas las alertas generadas
- Filtrar por estado (pendientes/vistas/resueltas)
- Filtrar por severidad (critical/high/medium/low)
- Marcar como vista
- Resolver con notas
- Ver metadata completa de cada alerta

### Badge de Notificación
**Ubicación:** Todas las páginas (topbar)
- Contador de alertas pendientes
- Visible solo para admin
- Actualización automática al cargar página
- Animación pulsante para llamar atención

---

## 📁 Archivos Modificados/Creados

### Creados:
- `backend/src/migrations/008_update_alert_thresholds_and_duplicate_detection.sql`
- `CAMBIOS_ALERTAS.md` (este documento)

### Modificados:
- `frontend/public/alertas.html` - Fix modal display

---

## ✅ Estado Actual

**Backend:** ✅ Corriendo en http://localhost:4000
**Migración 008:** ✅ Aplicada exitosamente
**Triggers:** ✅ Funcionando (`high_amount_egreso`, `similar_transfers_short_time`)
**Modal de Alertas:** ✅ Corregido
**Configuración:** ✅ Actualizada

---

## 📝 Recomendaciones de Uso

### Para Administradores:

1. **Revisión Diaria:**
   - Acceder a dashboard de alertas cada mañana
   - Revisar alertas críticas inmediatamente
   - Resolver alertas después de investigar

2. **Investigación de Duplicadas:**
   - Verificar metadata de `recent_transfers`
   - Comparar IDs de transferencia
   - Contactar al empleado que creó los egresos
   - Anular egreso duplicado si es necesario

3. **Ajuste de Umbrales:**
   - Si hay muchos falsos positivos: aumentar umbral
   - Si se escapan montos sospechosos: reducir umbral
   - Modificar directamente en tabla `alert_config`

### SQL para Ajustar Umbrales:
```sql
-- Cambiar umbral de monto alto
UPDATE alert_config
SET threshold_value = 150000
WHERE alert_type = 'high_amount_egreso';

-- Cambiar umbral de transferencias similares
UPDATE alert_config
SET threshold_value = 75000
WHERE alert_type = 'similar_transfers_short_time';

-- Ajustar ventana de tiempo
UPDATE alert_config
SET config_json = jsonb_set(config_json, '{time_window_minutes}', '60')
WHERE alert_type = 'similar_transfers_short_time';

-- Ajustar tolerancia de monto
UPDATE alert_config
SET config_json = jsonb_set(config_json, '{amount_tolerance_percent}', '10')
WHERE alert_type = 'similar_transfers_short_time';
```

---

## 🚀 Próximos Pasos (Opcionales)

1. **Implementar triggers para otras alertas:**
   - `multiple_egresos_short_time`
   - `unusual_hour`
   - `duplicate_id_transferencia`

2. **Notificaciones:**
   - Email/SMS para alertas críticas
   - Resumen diario de alertas para admin

3. **Análisis:**
   - Dashboard con gráficos de alertas por día/semana
   - Tasa de falsos positivos
   - Tiempos promedio de resolución

4. **Machine Learning:**
   - Detección de patrones anómalos
   - Ajuste automático de umbrales
   - Predicción de actividades sospechosas
