-- Migración 026: Agregar Lohas a empresas de salida
-- Fecha: 2026-03-01
-- Descripción: La migración 023 omitió incluir "Lohas" en el constraint CHECK
-- de empresa_salida, causando error 400 al registrar egresos con esa empresa.

-- Eliminar el constraint anterior
ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_empresa_salida_check;

-- Agregar nuevo constraint con todas las empresas incluyendo Lohas
ALTER TABLE egresos ADD CONSTRAINT egresos_empresa_salida_check
  CHECK (empresa_salida IN (
    'Telepagos',
    'Copter',
    'Palta',
    'Personal Pay',
    'Lemoncash',
    'NaranjaX',
    'TrustWallet',
    'Mercado Pago',
    'Brubank',
    'Binance',
    'AstroPay',
    'DolarApp',
    'Uala',
    'Cuenta DNI',
    'Lohas',
    'Otra (Especificar en notas)'
  ));

COMMENT ON CONSTRAINT egresos_empresa_salida_check ON egresos IS 'Empresas permitidas: Telepagos, Copter, Palta, Personal Pay, Lemoncash, NaranjaX, TrustWallet, Mercado Pago, Brubank, Binance, AstroPay, DolarApp, Uala, Cuenta DNI, Lohas, Otra';

SELECT 'Migración 026: Lohas agregado a constraint empresa_salida' AS info;
