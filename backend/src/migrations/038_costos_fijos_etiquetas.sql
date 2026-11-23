-- Etiquetas de egreso que cuentan como costo fijo del negocio en la pantalla
-- Socios (bloques "Información general" e "Información casa"). Cada etiqueta
-- va a una categoría (Empleados, Livechat, Servidor...). Se edita desde la
-- pantalla; las etiquetas que no están acá no cuentan como costo fijo.
CREATE TABLE IF NOT EXISTS costos_fijos_etiquetas (
  etiqueta     VARCHAR(80) PRIMARY KEY,
  categoria    VARCHAR(40) NOT NULL CHECK (length(trim(categoria)) > 0),
  updated_by   BIGINT REFERENCES users(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asignación inicial (se puede cambiar desde la pantalla).
INSERT INTO costos_fijos_etiquetas (etiqueta, categoria) VALUES
  ('[Unidad M] Pago de sueldo',        'Empleados'),
  ('[Unidad M] Adelanto de sueldo',    'Empleados'),
  ('[Unidad M] Pago LiveChat',         'Livechat'),
  ('[Programacion] Pago de servidor',  'Servidor'),
  ('[Unidad CRM]Gasto Fijo',           'Mantenimiento CRM'),
  ('[Granja] Costo Fijo',              'Granja'),
  ('[Granja] Plan de Datos',           'Granja')
ON CONFLICT (etiqueta) DO NOTHING;
