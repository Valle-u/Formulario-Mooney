-- Migración 012: Agregar control de intentos de login fallidos
-- Fecha: 2026-01-03
-- Descripción: Agrega campos para bloquear usuarios después de X intentos fallidos

-- Agregar columnas para control de intentos de login
ALTER TABLE users
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_failed_login TIMESTAMPTZ DEFAULT NULL;

-- Crear índice para optimizar búsquedas por locked_until
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until) WHERE locked_until IS NOT NULL;

-- Comentarios
COMMENT ON COLUMN users.failed_login_attempts IS 'Número de intentos fallidos consecutivos';
COMMENT ON COLUMN users.locked_until IS 'Fecha hasta la cual la cuenta está bloqueada (NULL = no bloqueada)';
COMMENT ON COLUMN users.last_failed_login IS 'Timestamp del último intento fallido';
