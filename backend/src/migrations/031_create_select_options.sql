-- Crear tabla select_options para opciones dinámicas de selects
CREATE TABLE IF NOT EXISTS select_options (
  id SERIAL PRIMARY KEY,
  option_type VARCHAR(20) NOT NULL,
  value TEXT NOT NULL,
  category VARCHAR(60),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  flag_usuario_casino BOOLEAN NOT NULL DEFAULT false,
  flag_premio_minimo BOOLEAN NOT NULL DEFAULT false,
  flag_cierre_caja BOOLEAN NOT NULL DEFAULT false,
  legacy_value TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(option_type, value)
);

CREATE INDEX IF NOT EXISTS idx_select_options_type_active
  ON select_options(option_type, is_active, sort_order);

-- Eliminar CHECK constraint de empresa_salida para permitir valores dinámicos
ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_empresa_salida_check;

-- Seed: Empresas de salida
INSERT INTO select_options (option_type, value, category, sort_order) VALUES
  ('empresa', 'Telepagos', NULL, 0),
  ('empresa', 'Copter', NULL, 1),
  ('empresa', 'Palta', NULL, 2),
  ('empresa', 'Personal Pay', NULL, 3),
  ('empresa', 'Lemoncash', NULL, 4),
  ('empresa', 'NaranjaX', NULL, 5),
  ('empresa', 'TrustWallet', NULL, 6),
  ('empresa', 'Mercado Pago', NULL, 7),
  ('empresa', 'Brubank', NULL, 8),
  ('empresa', 'Binance', NULL, 9),
  ('empresa', 'AstroPay', NULL, 10),
  ('empresa', 'DolarApp', NULL, 11),
  ('empresa', 'Uala', NULL, 12),
  ('empresa', 'Cuenta DNI', NULL, 13),
  ('empresa', 'Lohas', NULL, 14),
  ('empresa', 'Banco Nacion', NULL, 15),
  ('empresa', 'Otra (Especificar en notas)', NULL, 16)
ON CONFLICT (option_type, value) DO NOTHING;

-- Seed: Etiquetas - Unidad M
INSERT INTO select_options (option_type, value, category, sort_order, flag_usuario_casino, flag_premio_minimo, legacy_value) VALUES
  ('etiqueta', '[Unidad M] Deposito de cliente', 'Unidad M', 0, false, false, 'Deposito de cliente'),
  ('etiqueta', '[Unidad M] Premio Pagado', 'Unidad M', 1, true, true, 'Premio Pagado'),
  ('etiqueta', '[Unidad M] Premio por Sorteo', 'Unidad M', 2, false, false, NULL),
  ('etiqueta', '[Unidad M] Pago de sueldo', 'Unidad M', 3, false, false, 'Pago de sueldo'),
  ('etiqueta', '[Unidad M] Pago de Utilidades', 'Unidad M', 4, false, false, 'Pago de Utilidades'),
  ('etiqueta', '[Unidad M] Gasto de cuenta', 'Unidad M', 5, false, false, 'Gasto de cuenta'),
  ('etiqueta', '[Unidad M] Transferencia Rechazada', 'Unidad M', 6, false, false, 'Transferencia Rechazada'),
  ('etiqueta', '[Unidad M] IVA', 'Unidad M', 7, false, false, 'IVA'),
  ('etiqueta', '[Unidad M] Adelanto de sueldo', 'Unidad M', 8, false, false, 'Adelanto de sueldo'),
  ('etiqueta', '[Unidad M] Redireccion de capital', 'Unidad M', 9, false, false, 'Redireccion de capital'),
  ('etiqueta', '[Unidad M] Pago de premios duplicado', 'Unidad M', 10, false, false, 'Pago de premios duplicado'),
  ('etiqueta', '[Unidad M] Pago LiveChat', 'Unidad M', 11, false, false, 'Pago LiveChat'),
  ('etiqueta', '[Unidad M]  Prueba Casa', 'Unidad M', 12, false, false, NULL),
  ('etiqueta', '[Unidad M]  Duplicado', 'Unidad M', 13, false, false, NULL),
  ('etiqueta', '[Unidad M]  Error Empleado', 'Unidad M', 14, false, false, NULL),
  ('etiqueta', '[Unidad M]  Devolucion', 'Unidad M', 15, false, false, NULL),
  ('etiqueta', '[Unidad M]  NO ESTA EN FORMULARIO', 'Unidad M', 16, false, false, NULL),
  ('etiqueta', '[Unidad M]  No esta en la planilla empleados', 'Unidad M', 17, false, false, NULL),
  ('etiqueta', '[Unidad M] Pago de Estructura', 'Unidad M', 18, false, false, 'Pago de Estructura')
ON CONFLICT (option_type, value) DO NOTHING;

-- Seed: Etiquetas - Programacion
INSERT INTO select_options (option_type, value, category, sort_order, legacy_value) VALUES
  ('etiqueta', '[Programacion] Pago de servidor', 'Programacion', 19, 'Pago de servidor'),
  ('etiqueta', '[Programacion] Pago de fichas', 'Programacion', 20, 'Pago de fichas'),
  ('etiqueta', '[Programacion] Costo Fijo', 'Programacion', 21, 'Costo Fijo'),
  ('etiqueta', '[Programacion] Inversion', 'Programacion', 22, NULL)
ON CONFLICT (option_type, value) DO NOTHING;

-- Seed: Etiquetas - Publicidad
INSERT INTO select_options (option_type, value, category, sort_order, legacy_value) VALUES
  ('etiqueta', '[Publicidad]Gasto Fijo', 'Publicidad', 23, 'Gasto Fijo'),
  ('etiqueta', '[Publicidad] Inversion', 'Publicidad', 24, 'Inversion'),
  ('etiqueta', '[Publicidad] Pago Publicista', 'Publicidad', 25, NULL)
ON CONFLICT (option_type, value) DO NOTHING;

-- Seed: Etiquetas - Unidad CRM
INSERT INTO select_options (option_type, value, category, sort_order) VALUES
  ('etiqueta', '[Unidad CRM]Gasto Fijo', 'Unidad CRM', 26)
ON CONFLICT (option_type, value) DO NOTHING;

-- Seed: Etiquetas - Unidad Reca
INSERT INTO select_options (option_type, value, category, sort_order) VALUES
  ('etiqueta', '[Unidad Reca]Inversion', 'Unidad Reca', 27),
  ('etiqueta', '[Unidad Reca] Costo Fijo', 'Unidad Reca', 28),
  ('etiqueta', '[Unidad Reca] Cuenta Comprada', 'Unidad Reca', 29)
ON CONFLICT (option_type, value) DO NOTHING;

-- Seed: Etiquetas - Granja
INSERT INTO select_options (option_type, value, category, sort_order) VALUES
  ('etiqueta', '[Granja] Costo Fijo', 'Granja', 30),
  ('etiqueta', '[Granja] Inversion', 'Granja', 31),
  ('etiqueta', '[Granja] Plan de Datos', 'Granja', 32)
ON CONFLICT (option_type, value) DO NOTHING;

-- Seed: Etiquetas - Otra
INSERT INTO select_options (option_type, value, category, sort_order) VALUES
  ('etiqueta', '[Otra] Cambio a USD', 'Otra', 33),
  ('etiqueta', '[Otra] Cambio a USDT', 'Otra', 34),
  ('etiqueta', '[Otra] Cambio a Peso Fisico', 'Otra', 35),
  ('etiqueta', '[Otra] Gasto Personal Dragon', 'Otra', 36),
  ('etiqueta', '[Otra] Gasto Personal William', 'Otra', 37),
  ('etiqueta', '[Otra] Gasto limpieza', 'Otra', 38),
  ('etiqueta', '[Otra] Gasto de Cocina', 'Otra', 39),
  ('etiqueta', '[Otra] ROBO', 'Otra', 40),
  ('etiqueta', '[Otra] Recepcion de USDT', 'Otra', 41),
  ('etiqueta', '[Otra] Recepcion de USD', 'Otra', 42),
  ('etiqueta', '[Otra] Recepcion Dolar Fisico', 'Otra', 43),
  ('etiqueta', '[Otra] Recepcion Peso Fisico', 'Otra', 44),
  ('etiqueta', '[Otra] Cambio a Pesos', 'Otra', 45),
  ('etiqueta', '[Otra] Devolucion de Prestamo', 'Otra', 46),
  ('etiqueta', '[Otra] Pago Diseñadora', 'Otra', 47)
ON CONFLICT (option_type, value) DO NOTHING;

-- Seed: Etiquetas - Especiales (sin categoría)
INSERT INTO select_options (option_type, value, category, sort_order, flag_cierre_caja) VALUES
  ('etiqueta', 'Cierre de Caja', NULL, 48, true)
ON CONFLICT (option_type, value) DO NOTHING;

INSERT INTO select_options (option_type, value, category, sort_order) VALUES
  ('etiqueta', 'Otro', NULL, 49)
ON CONFLICT (option_type, value) DO NOTHING;
