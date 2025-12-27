-- Migración 007: Sistema de alertas para montos altos y actividades sospechosas

-- 1. Crear tabla de configuración de alertas
CREATE TABLE IF NOT EXISTS alert_config (
  id SERIAL PRIMARY KEY,
  alert_type VARCHAR(50) NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT true,
  threshold_value NUMERIC,
  config_json JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Crear tabla de alertas generadas
CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Entidad relacionada
  entity_type VARCHAR(50) NOT NULL,
  entity_id INTEGER NOT NULL,

  -- Detalles de la alerta
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,

  -- Usuario involucrado
  user_id INTEGER REFERENCES users(id),
  username VARCHAR(100),

  -- Estado
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'resolved', 'false_positive')),
  acknowledged_by INTEGER REFERENCES users(id),
  acknowledged_at TIMESTAMP,
  resolution_notes TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_entity ON alerts(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);

-- 3. Insertar configuración por defecto
INSERT INTO alert_config (alert_type, enabled, threshold_value, config_json) VALUES
('high_amount_egreso', true, 50000, '{"description": "Egreso con monto mayor al umbral", "notify_roles": ["admin"]}'::jsonb),
('multiple_egresos_short_time', true, 5, '{"description": "Múltiples egresos en corto período", "time_window_minutes": 10, "notify_roles": ["admin"]}'::jsonb),
('unusual_hour', true, null, '{"description": "Egreso fuera de horario laboral", "working_hours": {"start": "08:00", "end": "20:00"}, "notify_roles": ["admin"]}'::jsonb),
('duplicate_id_transferencia', true, null, '{"description": "ID de transferencia duplicado detectado", "notify_roles": ["admin"]}'::jsonb)
ON CONFLICT (alert_type) DO NOTHING;

-- 4. Función para verificar y crear alertas de montos altos
CREATE OR REPLACE FUNCTION check_high_amount_alert()
RETURNS TRIGGER AS $$
DECLARE
  threshold NUMERIC;
  config_enabled BOOLEAN;
BEGIN
  -- Solo para egresos nuevos y activos
  IF TG_OP = 'INSERT' AND NEW.status = 'activo' THEN

    -- Obtener configuración
    SELECT enabled, threshold_value
    INTO config_enabled, threshold
    FROM alert_config
    WHERE alert_type = 'high_amount_egreso';

    -- Si está habilitado y supera el umbral
    IF config_enabled AND NEW.monto >= threshold THEN
      INSERT INTO alerts (
        alert_type, severity, entity_type, entity_id,
        title, message, metadata, user_id, username
      ) VALUES (
        'high_amount_egreso',
        CASE
          WHEN NEW.monto >= threshold * 2 THEN 'critical'
          WHEN NEW.monto >= threshold * 1.5 THEN 'high'
          ELSE 'medium'
        END,
        'egreso', NEW.id,
        'Monto alto detectado',
        format('Egreso de $%s creado por %s. Empresa: %s, ID Trans: %s',
               NEW.monto,
               (SELECT username FROM users WHERE id = NEW.created_by),
               NEW.empresa_salida,
               NEW.id_transferencia),
        jsonb_build_object(
          'monto', NEW.monto,
          'threshold', threshold,
          'empresa_salida', NEW.empresa_salida,
          'id_transferencia', NEW.id_transferencia,
          'etiqueta', NEW.etiqueta
        ),
        NEW.created_by,
        (SELECT username FROM users WHERE id = NEW.created_by)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para alertas de montos altos
DROP TRIGGER IF EXISTS trg_check_high_amount ON egresos;
CREATE TRIGGER trg_check_high_amount
  AFTER INSERT ON egresos
  FOR EACH ROW
  EXECUTE FUNCTION check_high_amount_alert();

-- 5. Comentarios
COMMENT ON TABLE alert_config IS 'Configuración de tipos de alertas del sistema';
COMMENT ON TABLE alerts IS 'Registro de todas las alertas generadas';
COMMENT ON COLUMN alerts.severity IS 'Nivel de severidad: low, medium, high, critical';
COMMENT ON COLUMN alerts.status IS 'Estado: pending (nueva), acknowledged (vista), resolved (resuelta), false_positive';
