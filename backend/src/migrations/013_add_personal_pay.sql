-- Migración 013: Agregar "Personal Pay" como opción de empresa de salida
-- Fecha: 2026-01-03
-- Descripción: Actualiza el constraint CHECK de empresa_salida para incluir "Personal Pay"

-- Eliminar el constraint anterior
ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_empresa_salida_check;

-- Agregar nuevo constraint con "Personal Pay" incluido
ALTER TABLE egresos ADD CONSTRAINT egresos_empresa_salida_check
  CHECK (empresa_salida IN ('Telepagos', 'Copter', 'Palta', 'Personal Pay'));

-- Comentario
COMMENT ON CONSTRAINT egresos_empresa_salida_check ON egresos IS 'Empresas permitidas: Telepagos, Copter, Palta, Personal Pay';
