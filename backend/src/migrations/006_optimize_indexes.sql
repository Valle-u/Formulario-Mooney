-- 006_optimize_indexes.sql
-- Índices para optimizar búsquedas con alto volumen (1000+ registros/día)

-- EGRESOS: Índices para columnas de filtrado frecuente
CREATE INDEX IF NOT EXISTS idx_egresos_fecha ON egresos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_egresos_empresa_salida ON egresos(empresa_salida);
CREATE INDEX IF NOT EXISTS idx_egresos_etiqueta ON egresos(etiqueta);
CREATE INDEX IF NOT EXISTS idx_egresos_created_by ON egresos(created_by);

-- Índice compuesto para el ORDER BY más común (fecha + hora + id)
CREATE INDEX IF NOT EXISTS idx_egresos_order_default ON egresos(fecha DESC, hora DESC, id DESC);

-- Índices para búsquedas ILIKE (text pattern matching)
-- Usando pg_trgm para búsquedas parciales eficientes
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_egresos_usuario_casino_trgm ON egresos USING gin(usuario_casino gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_egresos_id_transferencia_trgm ON egresos USING gin(id_transferencia gin_trgm_ops);

-- Índice para rangos de monto
CREATE INDEX IF NOT EXISTS idx_egresos_monto ON egresos(monto);

-- Índice compuesto para filtros más comunes (fecha + empresa)
CREATE INDEX IF NOT EXISTS idx_egresos_fecha_empresa ON egresos(fecha DESC, empresa_salida);

-- USERS: Índice para JOIN frecuente
CREATE INDEX IF NOT EXISTS idx_users_id_username ON users(id, username);

-- AUDIT_LOGS: Índices para consultas de logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity, entity_id) WHERE entity IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_entity ON audit_logs(created_at DESC, entity);

-- Estadísticas para el optimizador de consultas
ANALYZE egresos;
ANALYZE users;
ANALYZE audit_logs;
