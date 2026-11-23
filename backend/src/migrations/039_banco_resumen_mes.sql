-- Totales del mes de la hoja "Balance Mensual Bancario" para la pantalla
-- Socios. Se recalculan cada vez que se carga el balance desde el formulario
-- (o a mano con "Traer del balance bancario"), así la pantalla no lee Sheets.
CREATE TABLE IF NOT EXISTS banco_resumen_mes (
  mes            DATE PRIMARY KEY CHECK (EXTRACT(DAY FROM mes) = 1),
  depositos      NUMERIC(18,2) NOT NULL DEFAULT 0,
  retiros        NUMERIC(18,2) NOT NULL DEFAULT 0,
  iva            NUMERIC(18,2) NOT NULL DEFAULT 0,
  movimientos    INTEGER NOT NULL DEFAULT 0,
  origen         VARCHAR(12) NOT NULL DEFAULT 'carga' CHECK (origen IN ('carga', 'sincronizar')),
  updated_by     BIGINT REFERENCES users(id),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
