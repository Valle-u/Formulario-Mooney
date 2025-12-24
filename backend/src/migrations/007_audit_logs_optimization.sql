-- 007_audit_logs_optimization.sql
-- Optimización de tabla de auditoría para alto volumen

-- IMPORTANTE: Este script agrega particionamiento automático por mes
-- y limpieza de logs antiguos para mantener la BD eficiente

-- 1. Agregar índice adicional para limpieza por fecha
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_only ON audit_logs(created_at);

-- 2. Función para limpiar logs antiguos (mantener solo últimos 6 meses)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Eliminar logs mayores a 6 meses
  DELETE FROM audit_logs
  WHERE created_at < NOW() - INTERVAL '6 months';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Log de la limpieza (esto no genera recursión porque es un INSERT directo)
  INSERT INTO audit_logs (
    actor_user_id,
    actor_username,
    actor_role,
    action,
    entity,
    success,
    status_code,
    details
  ) VALUES (
    NULL,
    'SYSTEM',
    'admin',
    'AUDIT_CLEANUP',
    'audit_logs',
    TRUE,
    200,
    jsonb_build_object('deleted_rows', deleted_count)
  );

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 3. Comentario: Para ejecutar limpieza manual
-- SELECT cleanup_old_audit_logs();

-- 4. OPCIONAL: Crear un cron job en PostgreSQL (requiere extensión pg_cron)
-- Descomenta las siguientes líneas si querés limpieza automática mensual:
/*
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Ejecutar limpieza el día 1 de cada mes a las 3 AM
SELECT cron.schedule(
  'cleanup-audit-logs',
  '0 3 1 * *',
  'SELECT cleanup_old_audit_logs();'
);
*/

-- 5. Análisis de la tabla para mantener estadísticas actualizadas
ANALYZE audit_logs;

-- 6. Comentarios y documentación
COMMENT ON FUNCTION cleanup_old_audit_logs() IS
  'Elimina logs de auditoría mayores a 6 meses para mantener la BD eficiente. Retorna cantidad de filas eliminadas.';
