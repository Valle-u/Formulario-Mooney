-- Migración 009: Eliminar sistema de alertas completo

-- 1. Eliminar triggers
DROP TRIGGER IF EXISTS trg_check_high_amount ON egresos;
DROP TRIGGER IF EXISTS trg_check_similar_transfers ON egresos;

-- 2. Eliminar funciones
DROP FUNCTION IF EXISTS check_high_amount_alert();
DROP FUNCTION IF EXISTS check_similar_transfers_alert();

-- 3. Eliminar índices específicos de alertas
DROP INDEX IF EXISTS idx_alerts_status;
DROP INDEX IF EXISTS idx_alerts_severity;
DROP INDEX IF EXISTS idx_alerts_created_at;
DROP INDEX IF EXISTS idx_alerts_entity;
DROP INDEX IF EXISTS idx_alerts_user;

-- 4. Eliminar índices de egresos creados para alertas
DROP INDEX IF EXISTS idx_egresos_empresa_created;
DROP INDEX IF EXISTS idx_egresos_monto_created;

-- 5. Eliminar tablas (alerts primero por las foreign keys)
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS alert_config CASCADE;
