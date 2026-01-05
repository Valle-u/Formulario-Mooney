-- Migración 014: Agregar "Lemoncash" y "NaranjaX" como opciones de empresa de salida
-- Fecha: 2026-01-05
-- Descripción: Actualiza el constraint CHECK de empresa_salida para incluir "Lemoncash" y "NaranjaX"

-- Eliminar el constraint anterior
ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_empresa_salida_check;

-- Agregar nuevo constraint con "Lemoncash" y "NaranjaX" incluidos
ALTER TABLE egresos ADD CONSTRAINT egresos_empresa_salida_check
  CHECK (empresa_salida IN ('Telepagos', 'Copter', 'Palta', 'Personal Pay', 'Lemoncash', 'NaranjaX'));

-- Comentario
COMMENT ON CONSTRAINT egresos_empresa_salida_check ON egresos IS 'Empresas permitidas: Telepagos, Copter, Palta, Personal Pay, Lemoncash, NaranjaX';
