-- 024: Permitir NULL en id_transferencia (checkbox "Sin ID")
-- El usuario puede marcar una casilla para enviar sin ID de transferencia

-- 1) Permitir NULL en la columna
ALTER TABLE egresos ALTER COLUMN id_transferencia DROP NOT NULL;

-- 2) Eliminar constraint alfanumérico que no permite NULL
ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_id_transferencia_alphanumeric_chk;

-- 3) Recrear constraint que permite NULL O alfanumérico válido
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'egresos_id_transferencia_alphanumeric_or_null_chk'
  ) THEN
    ALTER TABLE egresos
    ADD CONSTRAINT egresos_id_transferencia_alphanumeric_or_null_chk
    CHECK (id_transferencia IS NULL OR id_transferencia ~ '^[a-zA-Z0-9\-_]+$') NOT VALID;
  END IF;
END $$;

-- 4) Eliminar unique index viejo y recrear con soporte NULL
--    PostgreSQL ignora NULLs en UNIQUE INDEX naturalmente, así que no hay conflicto
DROP INDEX IF EXISTS egresos_unique_empresa_id;
CREATE UNIQUE INDEX egresos_unique_empresa_id
  ON egresos (empresa_salida, id_transferencia)
  WHERE id_transferencia IS NOT NULL;
