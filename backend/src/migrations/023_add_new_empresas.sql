-- Migración 023: Agregar nuevas empresas de salida
-- Fecha: 2026-02-03
-- Descripción: Actualiza el constraint CHECK de empresa_salida para incluir:
-- Brubank, Binance, AstroPay, DolarApp, Uala, Cuenta DNI, Otra (Especificar en notas)

-- Eliminar el constraint anterior
ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_empresa_salida_check;

-- Agregar nuevo constraint con todas las empresas
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
    'Otra (Especificar en notas)'
  ));

-- Comentario
COMMENT ON CONSTRAINT egresos_empresa_salida_check ON egresos IS 'Empresas permitidas: Telepagos, Copter, Palta, Personal Pay, Lemoncash, NaranjaX, TrustWallet, Mercado Pago, Brubank, Binance, AstroPay, DolarApp, Uala, Cuenta DNI, Otra';

SELECT 'Migración 023: Nuevas empresas de salida agregadas exitosamente' AS info;
