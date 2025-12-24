ALTER TABLE egresos
ADD COLUMN IF NOT EXISTS hora_solicitud_cliente TIME,
ADD COLUMN IF NOT EXISTS hora_quema_fichas TIME;
