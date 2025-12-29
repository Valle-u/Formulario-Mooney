-- Cambiar id_transferencia de BIGINT a TEXT para permitir alfanuméricos
-- Ejemplo: "ABC123", "TR-456", etc.

-- Primero eliminar el constraint que solo permite dígitos
ALTER TABLE egresos
DROP CONSTRAINT IF EXISTS egresos_id_transferencia_digits_chk;

-- Cambiar el tipo de columna a TEXT
ALTER TABLE egresos
ALTER COLUMN id_transferencia TYPE TEXT;

-- Agregar nuevo constraint para alfanuméricos
ALTER TABLE egresos
ADD CONSTRAINT egresos_id_transferencia_alphanumeric_chk
CHECK (id_transferencia ~ '^[a-zA-Z0-9\-_]+$') NOT VALID;

-- Actualizar el comentario de la columna
COMMENT ON COLUMN egresos.id_transferencia IS 'ID alfanumérico de la transferencia (puede contener letras, números, guiones y guiones bajos)';
