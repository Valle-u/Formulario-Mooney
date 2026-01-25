-- Migration 020: Agregar tipo de transacción para Flujo de Caja USD
-- Permite diferenciar entre ENTRADA (ingreso) y SALIDA (egreso) en dólares
-- ARS solo permite SALIDA (retrocompatible)

BEGIN;

-- Agregar columna tipo_transaccion
ALTER TABLE egresos ADD COLUMN tipo_transaccion VARCHAR(10) DEFAULT 'SALIDA' NOT NULL;

-- Constraint para validar valores
ALTER TABLE egresos ADD CONSTRAINT check_tipo_transaccion
  CHECK (tipo_transaccion IN ('ENTRADA', 'SALIDA'));

-- Comentarios para documentación
COMMENT ON COLUMN egresos.moneda IS 'Moneda: USD (Flujo de Caja USD) o ARS (Egresos solo SALIDA)';
COMMENT ON COLUMN egresos.tipo_transaccion IS 'ENTRADA (ingreso) o SALIDA (egreso). ARS siempre SALIDA.';

-- Indexes para optimizar consultas por moneda y tipo
CREATE INDEX IF NOT EXISTS idx_egresos_moneda_tipo ON egresos(moneda, tipo_transaccion);
CREATE INDEX IF NOT EXISTS idx_egresos_moneda_fecha ON egresos(moneda, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_egresos_tipo_fecha ON egresos(tipo_transaccion, fecha DESC);

-- Actualizar estadísticas del query planner
ANALYZE egresos;

COMMIT;
