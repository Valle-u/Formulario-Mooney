-- Migration 012: Sistema de Refresh Tokens
-- Fecha: 2026-01-01
-- Permite renovar access tokens sin reloguear, mejorando seguridad

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  -- Token hasheado para mayor seguridad
  token_hash TEXT NOT NULL,
  -- Metadata para seguridad
  ip_address VARCHAR(100),
  user_agent TEXT,
  -- Control de expiración
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Revocación manual
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revoked_by BIGINT REFERENCES users(id),
  revoke_reason TEXT
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Índice para limpieza automática
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_cleanup
ON refresh_tokens(expires_at, revoked)
WHERE revoked = false;

-- Comentarios
COMMENT ON TABLE refresh_tokens IS 'Tokens de refresco para renovar access tokens sin reloguear';
COMMENT ON COLUMN refresh_tokens.token IS 'Token en texto plano (solo se guarda en response inicial)';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'Hash SHA-256 del token para validación segura';
COMMENT ON COLUMN refresh_tokens.expires_at IS 'Refresh tokens viven 7 días por defecto';
COMMENT ON COLUMN refresh_tokens.revoked IS 'Permite invalidar tokens comprometidos';
