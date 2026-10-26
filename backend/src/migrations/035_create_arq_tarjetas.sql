-- Seguimiento de cuentas ARQ: cada cuenta tiene un saldo en USD y puede tener
-- varias tarjetas (global o local). Los fondeos salen de egresos del formulario;
-- consumos, transferencias entre cuentas y ajustes se cargan acá.

CREATE TABLE IF NOT EXISTS arq_cuentas (
  id            BIGSERIAL PRIMARY KEY,
  nombre        VARCHAR(80) NOT NULL UNIQUE,
  titular       VARCHAR(120),
  billetera     VARCHAR(40) NOT NULL DEFAULT 'ARQ',
  alias         VARCHAR(80),
  wallet        VARCHAR(120),
  telefono      VARCHAR(40),
  notas         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    BIGINT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS arq_tarjetas (
  id            BIGSERIAL PRIMARY KEY,
  cuenta_id     BIGINT NOT NULL REFERENCES arq_cuentas(id),
  tipo          VARCHAR(10) NOT NULL CHECK (tipo IN ('global', 'local')),
  alias         VARCHAR(80),
  ultimos4      VARCHAR(4) CHECK (ultimos4 IS NULL OR ultimos4 ~ '^[0-9]{4}$'),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_arq_tarjetas_cuenta ON arq_tarjetas(cuenta_id);

-- Etiquetas de egreso que son fondeos. Con cuenta_id, todo egreso con esa
-- etiqueta fondea esa cuenta. Sin cuenta_id (p. ej. "Costo MegaMooneyMaker"),
-- cada egreso queda "sin asignar" hasta que se elige la cuenta en arq_fondeos.
CREATE TABLE IF NOT EXISTS arq_etiquetas_fondeo (
  etiqueta      VARCHAR(80) PRIMARY KEY,
  cuenta_id     BIGINT REFERENCES arq_cuentas(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Datos que el egreso no tiene: la cuenta (si la etiqueta no la define),
-- los USD que acreditó ARQ (si se fondeó en ARS) o que no era un fondeo.
CREATE TABLE IF NOT EXISTS arq_fondeos (
  -- Sin el egreso este dato no significa nada: se borra con él.
  egreso_id     BIGINT PRIMARY KEY REFERENCES egresos(id) ON DELETE CASCADE,
  cuenta_id     BIGINT REFERENCES arq_cuentas(id),
  monto_usd     NUMERIC(18,2) CHECK (monto_usd IS NULL OR monto_usd > 0),
  descartado    BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by    BIGINT REFERENCES users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arq_movimientos (
  id                  BIGSERIAL PRIMARY KEY,
  tipo                VARCHAR(15) NOT NULL CHECK (tipo IN ('CONSUMO', 'TRANSFERENCIA', 'AJUSTE')),
  cuenta_id           BIGINT NOT NULL REFERENCES arq_cuentas(id),
  cuenta_destino_id   BIGINT REFERENCES arq_cuentas(id),
  tarjeta_id          BIGINT REFERENCES arq_tarjetas(id),
  servicio            VARCHAR(80),
  fecha               DATE NOT NULL,
  hora                TIME,
  -- Lo que suma o resta al saldo. Solo el AJUSTE puede ser negativo.
  monto_usd           NUMERIC(18,2) NOT NULL CHECK (monto_usd <> 0),
  moneda_origen       VARCHAR(4) NOT NULL DEFAULT 'USD' CHECK (moneda_origen IN ('USD', 'ARS')),
  monto_origen        NUMERIC(18,2) CHECK (monto_origen IS NULL OR monto_origen > 0),
  notas               TEXT,
  status              VARCHAR(10) NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'anulado')),
  motivo_anulacion    TEXT,
  anulado_por         BIGINT REFERENCES users(id),
  anulado_at          TIMESTAMPTZ,
  created_by          BIGINT NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by          BIGINT REFERENCES users(id),
  updated_at          TIMESTAMPTZ,
  CONSTRAINT arq_mov_monto_positivo CHECK (tipo = 'AJUSTE' OR monto_usd > 0),
  CONSTRAINT arq_mov_consumo CHECK (tipo <> 'CONSUMO' OR servicio IS NOT NULL),
  CONSTRAINT arq_mov_transferencia CHECK (
    (tipo = 'TRANSFERENCIA') = (cuenta_destino_id IS NOT NULL)
    AND (cuenta_destino_id IS NULL OR cuenta_destino_id <> cuenta_id)
  ),
  CONSTRAINT arq_mov_tarjeta CHECK (tipo = 'CONSUMO' OR tarjeta_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_arq_mov_cuenta_fecha ON arq_movimientos(cuenta_id, fecha);
CREATE INDEX IF NOT EXISTS idx_arq_mov_destino_fecha ON arq_movimientos(cuenta_destino_id, fecha)
  WHERE cuenta_destino_id IS NOT NULL;

-- Servicios que se pagan con las tarjetas. Se agregan nuevos al cargar un consumo.
CREATE TABLE IF NOT EXISTS arq_servicios (
  id            BIGSERIAL PRIMARY KEY,
  nombre        VARCHAR(80) NOT NULL UNIQUE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO arq_servicios (nombre) VALUES
  ('Meta'),
  ('Cursor'),
  ('Seenode')
ON CONFLICT (nombre) DO NOTHING;
