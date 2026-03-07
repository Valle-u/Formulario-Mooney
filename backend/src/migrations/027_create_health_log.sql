-- Health monitoring: registro de estado del servidor y DB
CREATE TABLE IF NOT EXISTS health_log (
  id SERIAL PRIMARY KEY,
  status VARCHAR(20) NOT NULL,          -- 'ok', 'db_error', 'db_slow', 'recovered'
  response_time_ms INTEGER,             -- latencia de la DB en ms
  memory_used_mb INTEGER,               -- RAM usada por Node.js
  error_message TEXT,                    -- detalle del error (null si ok)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_log_created_at ON health_log(created_at);
