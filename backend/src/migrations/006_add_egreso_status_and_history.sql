-- Migración 006: Sistema de estados y historial de cambios para egresos

-- 1. Agregar columna de estado a egresos
ALTER TABLE egresos
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'activo' CHECK (status IN ('activo', 'anulado', 'pendiente'));

-- 2. Agregar columna de motivo de anulación
ALTER TABLE egresos
ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT,
ADD COLUMN IF NOT EXISTS anulado_por INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS anulado_at TIMESTAMP;

-- 3. Agregar columnas de modificación
ALTER TABLE egresos
ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

-- 4. Crear tabla de historial de cambios
CREATE TABLE IF NOT EXISTS egresos_history (
  id SERIAL PRIMARY KEY,
  egreso_id INTEGER NOT NULL REFERENCES egresos(id) ON DELETE CASCADE,

  -- Quién hizo el cambio
  changed_by INTEGER NOT NULL REFERENCES users(id),
  changed_by_username VARCHAR(100) NOT NULL,
  changed_by_role VARCHAR(20) NOT NULL,

  -- Qué tipo de cambio
  change_type VARCHAR(50) NOT NULL CHECK (change_type IN (
    'CREATE', 'UPDATE', 'ANULAR', 'REACTIVAR', 'DELETE'
  )),

  -- Campo modificado (para UPDATE)
  field_name VARCHAR(100),
  old_value TEXT,
  new_value TEXT,

  -- Contexto adicional
  change_reason TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,

  -- Timestamp
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para mejor performance
CREATE INDEX IF NOT EXISTS idx_egresos_status ON egresos(status);
CREATE INDEX IF NOT EXISTS idx_egresos_history_egreso_id ON egresos_history(egreso_id);
CREATE INDEX IF NOT EXISTS idx_egresos_history_changed_by ON egresos_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_egresos_history_created_at ON egresos_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_egresos_history_change_type ON egresos_history(change_type);

-- 5. Función para registrar cambios automáticamente
CREATE OR REPLACE FUNCTION log_egreso_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo loguear si es UPDATE (CREATE y DELETE se manejan manualmente)
  IF TG_OP = 'UPDATE' THEN
    -- Detectar qué campos cambiaron y registrar cada uno

    IF OLD.monto IS DISTINCT FROM NEW.monto THEN
      INSERT INTO egresos_history (
        egreso_id, changed_by, changed_by_username, changed_by_role,
        change_type, field_name, old_value, new_value
      ) VALUES (
        NEW.id, NEW.updated_by,
        (SELECT username FROM users WHERE id = NEW.updated_by),
        (SELECT role FROM users WHERE id = NEW.updated_by),
        'UPDATE', 'monto', OLD.monto::TEXT, NEW.monto::TEXT
      );
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO egresos_history (
        egreso_id, changed_by, changed_by_username, changed_by_role,
        change_type, field_name, old_value, new_value, change_reason
      ) VALUES (
        NEW.id, NEW.updated_by,
        (SELECT username FROM users WHERE id = NEW.updated_by),
        (SELECT role FROM users WHERE id = NEW.updated_by),
        CASE WHEN NEW.status = 'anulado' THEN 'ANULAR' ELSE 'REACTIVAR' END,
        'status', OLD.status, NEW.status, NEW.motivo_anulacion
      );
    END IF;

    -- Otros campos importantes
    IF OLD.fecha IS DISTINCT FROM NEW.fecha THEN
      INSERT INTO egresos_history (
        egreso_id, changed_by, changed_by_username, changed_by_role,
        change_type, field_name, old_value, new_value
      ) VALUES (
        NEW.id, NEW.updated_by,
        (SELECT username FROM users WHERE id = NEW.updated_by),
        (SELECT role FROM users WHERE id = NEW.updated_by),
        'UPDATE', 'fecha', OLD.fecha::TEXT, NEW.fecha::TEXT
      );
    END IF;

    IF OLD.etiqueta IS DISTINCT FROM NEW.etiqueta THEN
      INSERT INTO egresos_history (
        egreso_id, changed_by, changed_by_username, changed_by_role,
        change_type, field_name, old_value, new_value
      ) VALUES (
        NEW.id, NEW.updated_by,
        (SELECT username FROM users WHERE id = NEW.updated_by),
        (SELECT role FROM users WHERE id = NEW.updated_by),
        'UPDATE', 'etiqueta', OLD.etiqueta, NEW.etiqueta
      );
    END IF;

    IF OLD.cuenta_receptora IS DISTINCT FROM NEW.cuenta_receptora THEN
      INSERT INTO egresos_history (
        egreso_id, changed_by, changed_by_username, changed_by_role,
        change_type, field_name, old_value, new_value
      ) VALUES (
        NEW.id, NEW.updated_by,
        (SELECT username FROM users WHERE id = NEW.updated_by),
        (SELECT role FROM users WHERE id = NEW.updated_by),
        'UPDATE', 'cuenta_receptora', OLD.cuenta_receptora, NEW.cuenta_receptora
      );
    END IF;

    IF OLD.notas IS DISTINCT FROM NEW.notas THEN
      INSERT INTO egresos_history (
        egreso_id, changed_by, changed_by_username, changed_by_role,
        change_type, field_name, old_value, new_value
      ) VALUES (
        NEW.id, NEW.updated_by,
        (SELECT username FROM users WHERE id = NEW.updated_by),
        (SELECT role FROM users WHERE id = NEW.updated_by),
        'UPDATE', 'notas', OLD.notas, NEW.notas
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para cambios automáticos
DROP TRIGGER IF EXISTS trg_egreso_change ON egresos;
CREATE TRIGGER trg_egreso_change
  AFTER UPDATE ON egresos
  FOR EACH ROW
  EXECUTE FUNCTION log_egreso_change();

-- 6. Actualizar egresos existentes con estado 'activo'
UPDATE egresos SET status = 'activo' WHERE status IS NULL;

-- 7. Comentarios
COMMENT ON COLUMN egresos.status IS 'Estado del egreso: activo, anulado, pendiente';
COMMENT ON COLUMN egresos.motivo_anulacion IS 'Razón por la cual se anuló el egreso';
COMMENT ON TABLE egresos_history IS 'Historial completo de cambios en egresos para auditoría';
COMMENT ON COLUMN egresos_history.change_type IS 'Tipo de cambio: CREATE, UPDATE, ANULAR, REACTIVAR, DELETE';
