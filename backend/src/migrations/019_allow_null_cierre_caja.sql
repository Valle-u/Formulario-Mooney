-- Migración 019: Permitir NULL en campos opcionales para Cierre de Caja
-- Campos que deben permitir NULL: cuenta_receptora, id_transferencia, turno

BEGIN;

-- Permitir NULL en cuenta_receptora
ALTER TABLE egresos
  ALTER COLUMN cuenta_receptora DROP NOT NULL;

-- Permitir NULL en id_transferencia
ALTER TABLE egresos
  ALTER COLUMN id_transferencia DROP NOT NULL;

-- Permitir NULL en turno (para cierre de caja sin turno específico)
ALTER TABLE egresos
  ALTER COLUMN turno DROP NOT NULL;

COMMIT;
