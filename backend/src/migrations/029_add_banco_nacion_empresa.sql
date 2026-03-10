-- Agregar Banco Nacion a la lista de empresas de salida
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
    'Mercado Pago',
    'Brubank',
    'Binance',
    'AstroPay',
    'DolarApp',
    'Uala',
    'Cuenta DNI',
    'Lohas',
    'Banco Nacion',
    'Otra (Especificar en notas)'
  ));
