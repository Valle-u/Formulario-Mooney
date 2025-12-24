CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  username        VARCHAR(50) UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            VARCHAR(20) NOT NULL CHECK (role IN ('admin','empleado')),
  full_name       VARCHAR(120),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      BIGINT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS egresos (
  id                      BIGSERIAL PRIMARY KEY,

  fecha                   DATE NOT NULL,
  hora                    TIME NOT NULL,
  turno                   VARCHAR(20) NOT NULL CHECK (turno IN ('Turno mañana','Turno tarde','Turno noche')),

  etiqueta                VARCHAR(80) NOT NULL,
  etiqueta_otro           VARCHAR(160),

  monto_raw               VARCHAR(30) NOT NULL,
  monto                   NUMERIC(18,2) NOT NULL CHECK (monto > 0),

  cuenta_receptora        VARCHAR(180) NOT NULL,
  usuario_casino          VARCHAR(80),

  cuenta_salida           VARCHAR(180) NOT NULL,
  empresa_salida          VARCHAR(40) NOT NULL,

  id_transferencia        VARCHAR(120) NOT NULL,

  comprobante_url         TEXT NOT NULL,
  comprobante_filename    VARCHAR(255) NOT NULL,
  comprobante_mime        VARCHAR(80) NOT NULL,
  comprobante_size        INTEGER NOT NULL,

  notas                   TEXT,

  created_by              BIGINT NOT NULL REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS egresos_unique_empresa_id
ON egresos (empresa_salida, id_transferencia);
