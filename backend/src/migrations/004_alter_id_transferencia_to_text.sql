-- Cambiar id_transferencia de BIGINT a TEXT para permitir alfanuméricos
-- Ejemplo: "ABC123", "TR-456", etc.

ALTER TABLE egresos
ALTER COLUMN id_transferencia TYPE TEXT;

-- Actualizar el comentario de la columna
COMMENT ON COLUMN egresos.id_transferencia IS 'ID alfanumérico de la transferencia (puede contener letras y números)';
