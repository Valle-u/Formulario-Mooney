-- Identificador único visible para cada egreso (ej: MNY-000001)
ALTER TABLE egresos ADD COLUMN codigo_operacion VARCHAR(20);

-- Backfill egresos existentes usando el id actual
UPDATE egresos SET codigo_operacion = 'MNY-' || LPAD(id::TEXT, 6, '0');

-- Ahora que todos tienen valor, hacer NOT NULL + UNIQUE
ALTER TABLE egresos ALTER COLUMN codigo_operacion SET NOT NULL;
ALTER TABLE egresos ADD CONSTRAINT egresos_codigo_operacion_unique UNIQUE (codigo_operacion);
