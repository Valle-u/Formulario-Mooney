-- 003_id_transferencia_digits.sql
-- Blindaje: id_transferencia solo dígitos
-- NOT VALID: no valida registros viejos, pero bloquea inserts/updates nuevos inválidos.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'egresos_id_transferencia_digits_chk'
  ) THEN
    ALTER TABLE egresos
      ADD CONSTRAINT egresos_id_transferencia_digits_chk
      CHECK (id_transferencia ~ '^[0-9]+$') NOT VALID;
  END IF;
END $$;
