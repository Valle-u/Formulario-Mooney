-- Migración 008: Actualizar umbrales de alertas y agregar detección de transferencias duplicadas/sospechosas

-- 1. Actualizar umbral de monto alto a $100,000
UPDATE alert_config
SET threshold_value = 100000
WHERE alert_type = 'high_amount_egreso';

-- 2. Agregar nueva configuración para transferencias similares
INSERT INTO alert_config (alert_type, enabled, threshold_value, config_json) VALUES
('similar_transfers_short_time', true, 50000, '{
  "description": "Transferencias similares (>$50k) en horario cercano - posible duplicación",
  "time_window_minutes": 30,
  "amount_tolerance_percent": 5,
  "notify_roles": ["admin"]
}'::jsonb)
ON CONFLICT (alert_type) DO UPDATE SET
  threshold_value = EXCLUDED.threshold_value,
  config_json = EXCLUDED.config_json;

-- 3. Función para detectar transferencias similares/duplicadas
CREATE OR REPLACE FUNCTION check_similar_transfers_alert()
RETURNS TRIGGER AS $$
DECLARE
  threshold NUMERIC;
  config_enabled BOOLEAN;
  time_window_minutes INTEGER;
  tolerance_percent NUMERIC;
  similar_count INTEGER;
  recent_egresos_json JSONB;
BEGIN
  -- Solo para egresos nuevos y activos con monto >= 50k
  IF TG_OP = 'INSERT' AND NEW.status = 'activo' THEN

    -- Obtener configuración
    SELECT enabled, threshold_value,
           (config_json->>'time_window_minutes')::INTEGER,
           (config_json->>'amount_tolerance_percent')::NUMERIC
    INTO config_enabled, threshold, time_window_minutes, tolerance_percent
    FROM alert_config
    WHERE alert_type = 'similar_transfers_short_time';

    -- Si está habilitado y el monto es >= threshold
    IF config_enabled AND NEW.monto >= threshold THEN

      -- Contar egresos similares
      SELECT COUNT(*)
      INTO similar_count
      FROM egresos e
      WHERE e.empresa_salida = NEW.empresa_salida
        AND e.id != NEW.id
        AND e.status = 'activo'
        AND e.created_at >= NOW() - INTERVAL '1 minute' * time_window_minutes
        AND e.created_at < NEW.created_at
        AND e.monto BETWEEN
            NEW.monto * (1 - tolerance_percent/100.0) AND
            NEW.monto * (1 + tolerance_percent/100.0);

      -- Si hay transferencias similares, obtener sus detalles
      IF similar_count > 0 THEN
        SELECT json_agg(json_build_object(
          'id', id,
          'monto', monto,
          'created_at', created_at,
          'id_transferencia', id_transferencia
        ))
        INTO recent_egresos_json
        FROM egresos e
        WHERE e.empresa_salida = NEW.empresa_salida
          AND e.id != NEW.id
          AND e.status = 'activo'
          AND e.created_at >= NOW() - INTERVAL '1 minute' * time_window_minutes
          AND e.created_at < NEW.created_at
          AND e.monto BETWEEN
              NEW.monto * (1 - tolerance_percent/100.0) AND
              NEW.monto * (1 + tolerance_percent/100.0);

        -- Crear alerta
        INSERT INTO alerts (
          alert_type, severity, entity_type, entity_id,
          title, message, metadata, user_id, username
        ) VALUES (
          'similar_transfers_short_time',
          CASE
            WHEN similar_count >= 3 THEN 'critical'
            WHEN similar_count >= 2 THEN 'high'
            ELSE 'medium'
          END,
          'egreso', NEW.id,
          '⚠️ Posible transferencia duplicada',
          format('Se detectó %s transferencia(s) similar(es) a %s en los últimos %s minutos. Empresa: %s. Verificar si es duplicación.',
                 similar_count,
                 '$' || NEW.monto::TEXT,
                 time_window_minutes,
                 NEW.empresa_salida),
          jsonb_build_object(
            'monto', NEW.monto,
            'empresa_salida', NEW.empresa_salida,
            'id_transferencia', NEW.id_transferencia,
            'similar_count', similar_count,
            'time_window_minutes', time_window_minutes,
            'recent_transfers', recent_egresos_json,
            'etiqueta', NEW.etiqueta
          ),
          NEW.created_by,
          (SELECT username FROM users WHERE id = NEW.created_by)
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para detección de transferencias similares
DROP TRIGGER IF EXISTS trg_check_similar_transfers ON egresos;
CREATE TRIGGER trg_check_similar_transfers
  AFTER INSERT ON egresos
  FOR EACH ROW
  EXECUTE FUNCTION check_similar_transfers_alert();

-- 4. Comentarios
COMMENT ON FUNCTION check_similar_transfers_alert IS 'Detecta transferencias similares en monto (±5%) y empresa dentro de una ventana de 30 minutos para identificar posibles duplicaciones';

-- 5. Agregar índice para mejorar performance de búsqueda
CREATE INDEX IF NOT EXISTS idx_egresos_empresa_created
ON egresos(empresa_salida, created_at DESC, status)
WHERE status = 'activo';

CREATE INDEX IF NOT EXISTS idx_egresos_monto_created
ON egresos(monto, created_at DESC)
WHERE status = 'activo';
