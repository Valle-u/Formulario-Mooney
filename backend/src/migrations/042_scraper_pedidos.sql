-- Pedidos para que el scraper traiga datos de los paneles de un rango de
-- fechas (solo al formulario, sin tocar planillas). Los carga admin o
-- dirección desde Socios; el scraper de la PC los toma y deja el resultado.
CREATE TABLE IF NOT EXISTS scraper_pedidos (
  id            BIGSERIAL PRIMARY KEY,
  desde         DATE NOT NULL,
  hasta         DATE NOT NULL,
  que           VARCHAR(10) NOT NULL CHECK (que IN ('netwin', 'pagos', 'todo')),
  estado        VARCHAR(12) NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'corriendo', 'listo', 'error', 'cancelado')),
  resultado     JSONB,
  creado_por    BIGINT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tomado_at     TIMESTAMPTZ,
  terminado_at  TIMESTAMPTZ,
  CHECK (hasta >= desde),
  CHECK (hasta - desde <= 62)
);

CREATE INDEX IF NOT EXISTS idx_scraper_pedidos_estado ON scraper_pedidos (estado, created_at);
