-- 025: Agregar moneda USDT (Tether) al sistema
-- Migra todos los registros USD existentes a USDT (son realmente USDT)
-- Expande VARCHAR(3) a VARCHAR(4) para soportar "USDT"

BEGIN;

-- 1) Expandir columna moneda de VARCHAR(3) a VARCHAR(4)
ALTER TABLE egresos ALTER COLUMN moneda TYPE VARCHAR(4);

-- 2) Eliminar constraint viejo de moneda
ALTER TABLE egresos DROP CONSTRAINT IF EXISTS check_moneda;

-- 3) Migrar todos los USD existentes a USDT
UPDATE egresos SET moneda = 'USDT' WHERE moneda = 'USD';

-- 4) Crear nuevo constraint con las 3 monedas
ALTER TABLE egresos ADD CONSTRAINT check_moneda CHECK (moneda IN ('USD', 'ARS', 'USDT'));

-- 5) Comentario descriptivo
COMMENT ON COLUMN egresos.moneda IS 'Moneda: USD, USDT (tether), ARS (pesos)';

COMMIT;
