-- Migración 015: Agregar 'editada' al constraint de status
-- Fecha: 2026-01-05
-- Descripción: El constraint CHECK de status no incluía 'editada', causando error 500 al editar

-- Eliminar el constraint anterior
ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_status_check;

-- Agregar nuevo constraint con 'editada' incluido
ALTER TABLE egresos ADD CONSTRAINT egresos_status_check
  CHECK (status IN ('activo', 'anulado', 'pendiente', 'editada'));

-- Comentario
COMMENT ON CONSTRAINT egresos_status_check ON egresos IS 'Estados permitidos: activo, anulado, pendiente, editada';
