# Nuevas Funcionalidades Implementadas

**Fecha**: 2025-12-24
**Versión**: 2.0

---

## Resumen

Se han implementado 5 funcionalidades críticas para mejorar la gestión y trazabilidad de egresos:

1. ✅ Edición de egresos (solo admin)
2. ✅ Sistema de estados y anulación de egresos
3. ✅ Historial completo de cambios (audit trail)
4. ✅ Sistema de alertas para montos altos y actividades sospechosas
5. ✅ Backup automático de base de datos

---

## 1. Edición de Egresos

### Descripción
Los administradores ahora pueden editar egresos existentes. Todos los cambios quedan registrados en el historial.

### Permisos
- **Quién puede editar**: Solo administradores
- **Restricciones**: No se pueden editar egresos anulados

### API Endpoint

**PUT /api/egresos/:id**

```bash
curl -X PUT http://localhost:4000/api/egresos/123 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "fecha": "2025-01-15",
    "monto": 15000.50,
    "cuenta_receptora": "Nueva Cuenta SA",
    "notas": "Actualización de datos",
    "change_reason": "Corrección de error en cuenta receptora"
  }'
```

### Campos Editables
- `fecha`
- `hora`
- `turno`
- `etiqueta`
- `etiqueta_otro`
- `monto_raw`
- `monto`
- `cuenta_receptora`
- `usuario_casino`
- `cuenta_salida`
- `empresa_salida`
- `notas`

### Response
```json
{
  "message": "Egreso actualizado correctamente"
}
```

### Audit Trail
Cada cambio genera:
- Registro en `audit_logs`
- Entradas en `egresos_history` (trigger automático)
- Campo `updated_by` y `updated_at` actualizado

---

## 2. Sistema de Estados y Anulación

### Estados de Egreso

| Estado | Descripción | Color UI |
|--------|-------------|----------|
| `activo` | Egreso válido y vigente | Verde |
| `anulado` | Egreso cancelado/invalidado | Rojo |
| `pendiente` | En revisión (futuro) | Amarillo |

### Anular Egreso

**POST /api/egresos/:id/anular**

```bash
curl -X POST http://localhost:4000/api/egresos/123/anular \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "motivo": "Transferencia rechazada por el banco. Error en CBU destino."
  }'
```

### Validaciones
- ✅ Solo admin puede anular
- ✅ Motivo es obligatorio
- ✅ No se puede anular un egreso ya anulado
- ✅ No se puede editar un egreso anulado

### Campos Agregados a `egresos`

```sql
status VARCHAR(20)              -- activo, anulado, pendiente
motivo_anulacion TEXT           -- Razón de la anulación
anulado_por INTEGER             -- ID del admin que anuló
anulado_at TIMESTAMP            -- Cuándo se anuló
updated_by INTEGER              -- Última modificación por
updated_at TIMESTAMP            -- Cuándo se modificó
```

---

## 3. Historial de Cambios (Audit Trail)

### Descripción
Sistema completo de trazabilidad que registra **cada cambio** en los egresos.

### Tabla: `egresos_history`

Almacena cada modificación individual de campos:

```sql
CREATE TABLE egresos_history (
  id SERIAL PRIMARY KEY,
  egreso_id INTEGER NOT NULL,

  -- Quién hizo el cambio
  changed_by INTEGER NOT NULL,
  changed_by_username VARCHAR(100),
  changed_by_role VARCHAR(20),

  -- Qué cambió
  change_type VARCHAR(50),        -- CREATE, UPDATE, ANULAR, etc
  field_name VARCHAR(100),        -- Campo modificado
  old_value TEXT,                 -- Valor anterior
  new_value TEXT,                 -- Valor nuevo
  change_reason TEXT,             -- Motivo del cambio

  -- Cuándo
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Tipos de Cambios

| change_type | Descripción |
|-------------|-------------|
| `CREATE` | Egreso creado |
| `UPDATE` | Campo modificado |
| `ANULAR` | Egreso anulado |
| `REACTIVAR` | Egreso reactivado |
| `DELETE` | Egreso eliminado (futuro) |

### Ver Historial de un Egreso

**GET /api/egresos/:id/history**

```bash
curl http://localhost:4000/api/egresos/123/history \
  -H "Authorization: Bearer <token>"
```

**Response**:
```json
{
  "egreso_id": 123,
  "changes": [
    {
      "id": 456,
      "egreso_id": 123,
      "changed_by": 1,
      "changed_by_username": "admin",
      "changed_by_role": "admin",
      "change_type": "UPDATE",
      "field_name": "monto",
      "old_value": "10000.00",
      "new_value": "15000.50",
      "change_reason": null,
      "created_at_formatted": "2025-01-15 14:30:22"
    },
    {
      "id": 457,
      "egreso_id": 123,
      "changed_by": 1,
      "changed_by_username": "admin",
      "changed_by_role": "admin",
      "change_type": "UPDATE",
      "field_name": "cuenta_receptora",
      "old_value": "Cuenta Vieja SA",
      "new_value": "Nueva Cuenta SA",
      "change_reason": null,
      "created_at_formatted": "2025-01-15 14:30:22"
    }
  ]
}
```

### Trigger Automático
La tabla se actualiza automáticamente mediante un trigger de PostgreSQL que detecta cambios en estos campos:
- monto
- status
- fecha
- etiqueta
- cuenta_receptora
- notas

---

## 4. Sistema de Alertas

### Descripción
Sistema inteligente que detecta y notifica actividades sospechosas o montos altos.

### Tipos de Alertas

| Tipo | Descripción | Umbral Default |
|------|-------------|----------------|
| `high_amount_egreso` | Monto superior al umbral | $50,000 |
| `multiple_egresos_short_time` | 5+ egresos en 10 min | 5 en 10 min |
| `unusual_hour` | Fuera de horario laboral | 8am - 8pm |
| `duplicate_id_transferencia` | ID duplicado detectado | N/A |

### Niveles de Severidad

| Severidad | Criterio | Color |
|-----------|----------|-------|
| `low` | Informativo | Azul |
| `medium` | Requiere atención | Amarillo |
| `high` | Importante | Naranja |
| `critical` | Urgente | Rojo |

**Ejemplo**: Monto > $100k = `critical`, Monto entre $50k-$100k = `high`

### Estados de Alerta

| Estado | Descripción |
|--------|-------------|
| `pending` | Nueva, sin revisar |
| `acknowledged` | Vista por admin |
| `resolved` | Investigada y resuelta |
| `false_positive` | Falsa alarma |

### API Endpoints

#### Listar Alertas

**GET /api/alerts**

```bash
curl http://localhost:4000/api/alerts?status=pending&severity=high \
  -H "Authorization: Bearer <token>"
```

Parámetros:
- `status`: pending, acknowledged, resolved, false_positive
- `severity`: low, medium, high, critical
- `limit`: máximo de resultados (default 50)
- `offset`: para paginación

#### Estadísticas de Alertas

**GET /api/alerts/stats**

```json
{
  "total": 145,
  "pending": 12,
  "acknowledged": 8,
  "resolved": 120,
  "critical": 3,
  "high": 15,
  "medium": 50,
  "low": 77,
  "last_24h": 5,
  "last_7d": 32
}
```

#### Marcar como Vista

**POST /api/alerts/:id/acknowledge**

```bash
curl -X POST http://localhost:4000/api/alerts/789/acknowledge \
  -H "Authorization: Bearer <token>"
```

#### Resolver Alerta

**POST /api/alerts/:id/resolve**

```bash
curl -X POST http://localhost:4000/api/alerts/789/resolve \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Verificado con el cliente. Transferencia legítima.",
    "is_false_positive": false
  }'
```

#### Configuración de Alertas

**GET /api/alerts/config**

Ver configuración actual de umbrales y reglas.

**PUT /api/alerts/config/:id**

Actualizar configuración (ej: cambiar umbral de $50k a $100k):

```bash
curl -X PUT http://localhost:4000/api/alerts/config/1 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "threshold_value": 100000,
    "enabled": true
  }'
```

### Alerta Automática

Cuando se crea un egreso con monto >= $50,000:

1. Trigger de PostgreSQL detecta el monto
2. Se crea automáticamente un registro en `alerts`
3. Admin puede ver la alerta en el dashboard
4. Admin investiga y marca como resuelta

---

## 5. Backup Automático de Base de Datos

### Descripción
Script robusto para crear backups de PostgreSQL con compresión y limpieza automática.

### Uso Manual

```bash
# Backup básico
cd backend
npm run backup

# Especificar directorio
node scripts/backup-database.js --output=/path/to/backups

# Cambiar retención
node scripts/backup-database.js --keep-days=60
```

### Variables de Entorno

```env
# .env
DATABASE_URL=postgresql://user:pass@localhost:5432/mooney_db

# O variables individuales
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mooney_db
DB_USER=postgres
DB_PASSWORD=mipassword

# Configuración de backup
BACKUP_DIR=./backups
BACKUP_KEEP_DAYS=30
BACKUP_COMPRESSION=true
```

### Características

✅ **Compresión gzip** - Reduce tamaño ~80%
✅ **Limpieza automática** - Elimina backups mayores a X días
✅ **Verbose logging** - Muestra progreso y estadísticas
✅ **Validación** - Verifica que el archivo se creó correctamente
✅ **Multi-plataforma** - Funciona en Windows, Linux, Mac

### Salida Ejemplo

```
═══════════════════════════════════════════════════
🗄️  BACKUP AUTOMÁTICO DE BASE DE DATOS
═══════════════════════════════════════════════════

📊 Configuración:
   Host: localhost:5432
   Database: mooney_db
   Usuario: postgres
   Compresión: Sí (gzip)
   Retención: 30 días

✅ Directorio de backups: E:\backups

🔄 Ejecutando backup de mooney_db...
📦 Archivo: backup_2025-01-15_14-30-22.sql.gz

✅ Backup completado exitosamente
   Tamaño: 2.45 MB
   Duración: 3.12s
   Ruta: E:\backups\backup_2025-01-15_14-30-22.sql.gz

🧹 Limpiando backups mayores a 30 días...
   🗑️  Eliminado: backup_2024-12-01_10-15-30.sql.gz (45.3 días)
   🗑️  Eliminado: backup_2024-11-28_09-20-15.sql.gz (48.7 días)

✅ 2 backup(s) antiguo(s) eliminado(s)
   Espacio liberado: 4.82 MB

═══════════════════════════════════════════════════
✅ PROCESO COMPLETADO
═══════════════════════════════════════════════════
```

### Automatización con Cron (Linux/Mac)

```bash
# Editar crontab
crontab -e

# Backup diario a las 2 AM
0 2 * * * cd /path/to/backend && /usr/bin/node scripts/backup-database.js >> /var/log/mooney-backup.log 2>&1
```

### Automatización con Task Scheduler (Windows)

1. Abrir Task Scheduler
2. Crear tarea básica
3. Trigger: Diariamente a las 2 AM
4. Action: Iniciar programa
   - Programa: `node.exe`
   - Argumentos: `scripts/backup-database.js`
   - Iniciar en: `E:\path\to\backend`

### Restaurar Backup

```bash
# Backup sin comprimir
psql -h localhost -U postgres -d mooney_db < backup_2025-01-15.sql

# Backup comprimido
gunzip -c backup_2025-01-15.sql.gz | psql -h localhost -U postgres -d mooney_db
```

---

## Migraciones SQL

Se agregaron 2 nuevas migraciones:

### 006_add_egreso_status_and_history.sql
- Agrega columnas de estado a `egresos`
- Crea tabla `egresos_history`
- Implementa trigger automático de logging
- Agrega índices para performance

### 007_add_alerts_system.sql
- Crea tabla `alert_config`
- Crea tabla `alerts`
- Implementa trigger de alertas automáticas
- Configura alertas por defecto

**Las migraciones se ejecutan automáticamente** al iniciar el servidor.

---

## Archivos Nuevos/Modificados

### Backend

**Nuevos**:
- `src/migrations/006_add_egreso_status_and_history.sql`
- `src/migrations/007_add_alerts_system.sql`
- `src/routes/alerts.js`
- `scripts/backup-database.js`

**Modificados**:
- `src/routes/egresos.js` (endpoints de edición, anulación, historial)
- `src/server.js` (ruta de alertas)
- `package.json` (script de backup)

---

## Testing

### Pruebas Recomendadas

1. **Edición de Egreso**
   ```bash
   # Login como admin
   # Editar un egreso
   # Verificar que el cambio se registró en historial
   ```

2. **Anulación**
   ```bash
   # Anular un egreso con motivo
   # Verificar que no se puede editar después
   # Ver historial de anulación
   ```

3. **Alertas**
   ```bash
   # Crear egreso con monto > $50,000
   # Verificar que se creó una alerta
   # Marcar alerta como vista
   # Resolver alerta
   ```

4. **Backup**
   ```bash
   npm run backup
   # Verificar que el archivo se creó en ./backups
   # Intentar restaurar en BD de prueba
   ```

---

## Próximas Mejoras Sugeridas

### Alta Prioridad
- [ ] Frontend para editar egresos (modal de edición)
- [ ] UI para ver historial de cambios
- [ ] Dashboard de alertas en tiempo real
- [ ] Notificaciones push/email para alertas críticas

### Media Prioridad
- [ ] Exportar historial de cambios a Excel
- [ ] Gráficos de alertas por tipo/severidad
- [ ] Configuración de alertas desde UI
- [ ] Backup automático a cloud (S3, Google Drive)

### Baja Prioridad
- [ ] Alertas personalizadas por usuario
- [ ] Webhooks para alertas
- [ ] API de restauración de backups

---

## Conclusión

Se han implementado 5 funcionalidades críticas que mejoran significativamente:

- ✅ **Trazabilidad**: Historial completo de cada cambio
- ✅ **Control**: Edición y anulación de egresos
- ✅ **Seguridad**: Alertas automáticas para actividades sospechosas
- ✅ **Continuidad**: Backups automáticos de datos

El sistema ahora cuenta con las herramientas necesarias para una gestión profesional y auditable de egresos financieros.

---

**Documentación actualizada**: 2025-12-24
**Versión del sistema**: 2.0
