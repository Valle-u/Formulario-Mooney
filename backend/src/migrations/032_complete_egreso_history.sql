-- 032: Historial de cambios completo
-- - edited_at: marca "fue editado" sin ocupar el campo status
-- - last_change_reason: el PUT escribe el motivo acá; el trigger lo copia a egresos_history
-- - el trigger pasa a registrar todas las columnas de negocio
-- - los egresos con status='editada' vuelven a 'activo' conservando edited_at

ALTER TABLE egresos
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_change_reason TEXT;

COMMENT ON COLUMN egresos.edited_at IS 'Última vez que se editó el egreso. Independiente de status (activo/anulado/pendiente).';
COMMENT ON COLUMN egresos.last_change_reason IS 'Motivo de la última edición. Lo escribe el PUT y lo lee el trigger de historial.';

-- Migrar el abuso histórico de status='editada' a un flag propio
UPDATE egresos
SET
  edited_at = COALESCE(edited_at, updated_at, CURRENT_TIMESTAMP),
  status = 'activo'
WHERE status = 'editada';

CREATE OR REPLACE FUNCTION log_egreso_change()
RETURNS TRIGGER AS $$
DECLARE
  v_username VARCHAR(100);
  v_role VARCHAR(20);
  v_reason TEXT;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Sin updated_by no hay actor: no inventar filas de historial
  IF NEW.updated_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT username, role INTO v_username, v_role
  FROM users WHERE id = NEW.updated_by;

  IF v_username IS NULL THEN
    RETURN NEW;
  END IF;

  v_reason := NULLIF(BTRIM(NEW.last_change_reason), '');

  -- Helper inline: insertar un renglón por cada campo que cambió
  IF OLD.fecha IS DISTINCT FROM NEW.fecha THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'fecha', OLD.fecha::TEXT, NEW.fecha::TEXT, v_reason);
  END IF;

  IF OLD.hora IS DISTINCT FROM NEW.hora THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'hora', OLD.hora::TEXT, NEW.hora::TEXT, v_reason);
  END IF;

  IF OLD.turno IS DISTINCT FROM NEW.turno THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'turno', OLD.turno, NEW.turno, v_reason);
  END IF;

  IF OLD.etiqueta IS DISTINCT FROM NEW.etiqueta THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'etiqueta', OLD.etiqueta, NEW.etiqueta, v_reason);
  END IF;

  IF OLD.etiqueta_otro IS DISTINCT FROM NEW.etiqueta_otro THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'etiqueta_otro', OLD.etiqueta_otro, NEW.etiqueta_otro, v_reason);
  END IF;

  IF OLD.moneda IS DISTINCT FROM NEW.moneda THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'moneda', OLD.moneda, NEW.moneda, v_reason);
  END IF;

  IF OLD.tipo_transaccion IS DISTINCT FROM NEW.tipo_transaccion THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'tipo_transaccion', OLD.tipo_transaccion, NEW.tipo_transaccion, v_reason);
  END IF;

  IF OLD.monto IS DISTINCT FROM NEW.monto THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'monto', OLD.monto::TEXT, NEW.monto::TEXT, v_reason);
  END IF;

  IF OLD.monto_raw IS DISTINCT FROM NEW.monto_raw THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'monto_raw', OLD.monto_raw, NEW.monto_raw, v_reason);
  END IF;

  IF OLD.cuenta_receptora IS DISTINCT FROM NEW.cuenta_receptora THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'cuenta_receptora', OLD.cuenta_receptora, NEW.cuenta_receptora, v_reason);
  END IF;

  IF OLD.usuario_casino IS DISTINCT FROM NEW.usuario_casino THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'usuario_casino', OLD.usuario_casino, NEW.usuario_casino, v_reason);
  END IF;

  IF OLD.hora_solicitud_cliente IS DISTINCT FROM NEW.hora_solicitud_cliente THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'hora_solicitud_cliente', OLD.hora_solicitud_cliente::TEXT, NEW.hora_solicitud_cliente::TEXT, v_reason);
  END IF;

  IF OLD.hora_quema_fichas IS DISTINCT FROM NEW.hora_quema_fichas THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'hora_quema_fichas', OLD.hora_quema_fichas::TEXT, NEW.hora_quema_fichas::TEXT, v_reason);
  END IF;

  IF OLD.cuenta_salida IS DISTINCT FROM NEW.cuenta_salida THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'cuenta_salida', OLD.cuenta_salida, NEW.cuenta_salida, v_reason);
  END IF;

  IF OLD.empresa_salida IS DISTINCT FROM NEW.empresa_salida THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'empresa_salida', OLD.empresa_salida, NEW.empresa_salida, v_reason);
  END IF;

  IF OLD.id_transferencia IS DISTINCT FROM NEW.id_transferencia THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'id_transferencia', OLD.id_transferencia, NEW.id_transferencia, v_reason);
  END IF;

  IF OLD.codigo_operacion IS DISTINCT FROM NEW.codigo_operacion THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'codigo_operacion', OLD.codigo_operacion, NEW.codigo_operacion, v_reason);
  END IF;

  IF OLD.notas IS DISTINCT FROM NEW.notas THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'notas', OLD.notas, NEW.notas, v_reason);
  END IF;

  IF OLD.comprobante_url IS DISTINCT FROM NEW.comprobante_url THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (NEW.id, NEW.updated_by, v_username, v_role, 'UPDATE', 'comprobante', OLD.comprobante_filename, NEW.comprobante_filename, v_reason);
  END IF;

  -- Status: solo ANULAR / REACTIVAR reales. Ya no se usa status='editada'.
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO egresos_history (egreso_id, changed_by, changed_by_username, changed_by_role, change_type, field_name, old_value, new_value, change_reason)
    VALUES (
      NEW.id, NEW.updated_by, v_username, v_role,
      CASE
        WHEN NEW.status = 'anulado' THEN 'ANULAR'
        WHEN OLD.status = 'anulado' THEN 'REACTIVAR'
        ELSE 'UPDATE'
      END,
      'status', OLD.status, NEW.status,
      COALESCE(NULLIF(BTRIM(NEW.motivo_anulacion), ''), v_reason)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_egreso_change ON egresos;
CREATE TRIGGER trg_egreso_change
  AFTER UPDATE ON egresos
  FOR EACH ROW
  EXECUTE FUNCTION log_egreso_change();

COMMENT ON COLUMN egresos.status IS 'Estado del egreso: activo, anulado, pendiente. La marca de edición vive en edited_at.';
