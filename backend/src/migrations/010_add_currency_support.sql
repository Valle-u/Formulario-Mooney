-- Migration 010: Agregar soporte para monedas (USD y ARS)
-- Fecha: 2025-12-27

-- Agregar columna moneda a la tabla egresos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'egresos' AND column_name = 'moneda'
  ) THEN
    ALTER TABLE egresos
    ADD COLUMN moneda VARCHAR(3) DEFAULT 'ARS' NOT NULL;
  END IF;
END $$;

-- Agregar constraint para validar solo USD o ARS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_moneda'
  ) THEN
    ALTER TABLE egresos
    ADD CONSTRAINT check_moneda CHECK (moneda IN ('USD', 'ARS'));
  END IF;
END $$;

-- Crear índice para mejorar búsquedas por moneda
CREATE INDEX IF NOT EXISTS idx_egresos_moneda ON egresos(moneda);

-- Comentarios
COMMENT ON COLUMN egresos.moneda IS 'Moneda de la transferencia: USD (dólares) o ARS (pesos argentinos)';
