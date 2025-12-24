-- 005_create_audit_logs.sql
-- Tabla de auditoría (inmutable) para monitoreo por usuario.

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  actor_user_id BIGINT,
  actor_username VARCHAR(50),
  actor_role VARCHAR(20),

  action VARCHAR(80) NOT NULL,    -- ej: AUTH_LOGIN_SUCCESS, EGRESO_CREATE
  entity VARCHAR(60),             -- ej: users, egresos, auth
  entity_id BIGINT,               -- ej: egreso.id o users.id

  success BOOLEAN NOT NULL DEFAULT TRUE,
  status_code INTEGER,

  ip TEXT,
  user_agent TEXT,

  details JSONB                   -- datos relevantes (sin passwords)
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
