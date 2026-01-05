-- Migración 016: Agregar "TrustWallet" como opción de empresa de salida
-- Fecha: 2026-01-05
-- Descripción: Actualiza el constraint CHECK de empresa_salida para incluir "TrustWallet"

-- Eliminar el constraint anterior
ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_empresa_salida_check;

-- Agregar nuevo constraint con "TrustWallet" incluido
ALTER TABLE egresos ADD CONSTRAINT egresos_empresa_salida_check
  CHECK (empresa_salida IN ('Telepagos', 'Copter', 'Palta', 'Personal Pay', 'Lemoncash', 'NaranjaX', 'TrustWallet'));

-- Comentario
COMMENT ON CONSTRAINT egresos_empresa_salida_check ON egresos IS 'Empresas permitidas: Telepagos, Copter, Palta, Personal Pay, Lemoncash, NaranjaX, TrustWallet';
