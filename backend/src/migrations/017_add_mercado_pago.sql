-- Migración 017: Agregar Mercado Pago a empresa_salida
-- Fecha: 2026-01-07
-- Descripción: Agrega "Mercado Pago" como opción válida en el constraint de empresa_salida

ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_empresa_salida_check;

ALTER TABLE egresos ADD CONSTRAINT egresos_empresa_salida_check
  CHECK (empresa_salida IN (
    'Telepagos',
    'Copter',
    'Palta',
    'Personal Pay',
    'Lemoncash',
    'NaranjaX',
    'TrustWallet',
    'Mercado Pago'
  ));
