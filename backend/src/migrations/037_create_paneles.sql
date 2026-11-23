-- Control de socios y paneles: datos diarios que manda el scraper del panel
-- de MooneyMaker y la configuración del reparto (GGR, costos, empleados).

-- Paneles: socios, paneles personales y los de control (ADMIN, AGENTEMC).
-- mooneymaker_usuario es el nombre de usuario del panel (no es secreto); las
-- credenciales viven solo en el scraper.
CREATE TABLE IF NOT EXISTS paneles (
  id                    BIGSERIAL PRIMARY KEY,
  nombre                VARCHAR(60) NOT NULL UNIQUE,
  tipo                  VARCHAR(10) NOT NULL CHECK (tipo IN ('socio', 'personal', 'control')),
  mooneymaker_usuario   VARCHAR(80),
  orden                 INTEGER NOT NULL DEFAULT 0,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ
);

-- Un registro por día y panel. Los campos son opcionales: el netwin y las
-- estadísticas de pago llegan por separado y se combinan sin pisarse.
CREATE TABLE IF NOT EXISTS panel_diario (
  fecha                 DATE NOT NULL,
  panel_id              BIGINT NOT NULL REFERENCES paneles(id),
  netwin                NUMERIC(18,2),
  entrada               NUMERIC(18,2),
  salida                NUMERIC(18,2),
  ops_entrada           INTEGER CHECK (ops_entrada IS NULL OR ops_entrada >= 0),
  ops_salida            INTEGER CHECK (ops_salida IS NULL OR ops_salida >= 0),
  bonos                 NUMERIC(18,2),
  inversion_publicidad  NUMERIC(18,2),
  fuente                VARCHAR(10) NOT NULL DEFAULT 'scraper' CHECK (fuente IN ('scraper', 'import', 'manual')),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fecha, panel_id)
);

CREATE INDEX IF NOT EXISTS idx_panel_diario_panel_fecha ON panel_diario(panel_id, fecha);

-- Datos del mes que se cargan a mano (mes = primer día del mes).
CREATE TABLE IF NOT EXISTS socios_mes (
  mes                   DATE PRIMARY KEY CHECK (EXTRACT(DAY FROM mes) = 1),
  factura_usd           NUMERIC(18,2) CHECK (factura_usd IS NULL OR factura_usd >= 0),
  cotizacion            NUMERIC(18,2) CHECK (cotizacion IS NULL OR cotizacion > 0),
  pct_fichas_pactado    NUMERIC(7,6) NOT NULL DEFAULT 0.18 CHECK (pct_fichas_pactado BETWEEN 0 AND 1),
  pct_cef_socio         NUMERIC(7,6) NOT NULL DEFAULT 0.0225 CHECK (pct_cef_socio BETWEEN 0 AND 1),
  updated_by            BIGINT REFERENCES users(id),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reparto de cada socio por mes, para que cambiar un % no reescriba los meses
-- anteriores. Los % de GGR suman 1 y los de costos también.
CREATE TABLE IF NOT EXISTS panel_config_mes (
  mes                   DATE NOT NULL CHECK (EXTRACT(DAY FROM mes) = 1),
  panel_id              BIGINT NOT NULL REFERENCES paneles(id),
  pct_ggr_socio         NUMERIC(7,6) NOT NULL DEFAULT 0.5 CHECK (pct_ggr_socio BETWEEN 0 AND 1),
  pct_ggr_casa          NUMERIC(7,6) NOT NULL DEFAULT 0.5 CHECK (pct_ggr_casa BETWEEN 0 AND 1),
  pct_ggr_nexo          NUMERIC(7,6) NOT NULL DEFAULT 0 CHECK (pct_ggr_nexo BETWEEN 0 AND 1),
  pct_costos_socio      NUMERIC(7,6) NOT NULL DEFAULT 0.5 CHECK (pct_costos_socio BETWEEN 0 AND 1),
  pct_costos_casa       NUMERIC(7,6) NOT NULL DEFAULT 0.5 CHECK (pct_costos_casa BETWEEN 0 AND 1),
  pct_costos_nexo       NUMERIC(7,6) NOT NULL DEFAULT 0 CHECK (pct_costos_nexo BETWEEN 0 AND 1),
  nexo_panel_id         BIGINT REFERENCES paneles(id),
  empleados             NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (empleados >= 0),
  costo_estructura_s1   NUMERIC(18,2) NOT NULL DEFAULT 0,
  costo_estructura_s2   NUMERIC(18,2) NOT NULL DEFAULT 0,
  costo_estructura_s3   NUMERIC(18,2) NOT NULL DEFAULT 0,
  costo_estructura_s4   NUMERIC(18,2) NOT NULL DEFAULT 0,
  costo_estructura_s5   NUMERIC(18,2) NOT NULL DEFAULT 0,
  updated_by            BIGINT REFERENCES users(id),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (mes, panel_id),
  CONSTRAINT panel_config_ggr_suma CHECK (ABS(pct_ggr_socio + pct_ggr_casa + pct_ggr_nexo - 1) < 0.0001),
  CONSTRAINT panel_config_costos_suma CHECK (ABS(pct_costos_socio + pct_costos_casa + pct_costos_nexo - 1) < 0.0001),
  CONSTRAINT panel_config_nexo CHECK (
    (nexo_panel_id IS NULL AND pct_ggr_nexo = 0 AND pct_costos_nexo = 0)
    OR (nexo_panel_id IS NOT NULL AND nexo_panel_id <> panel_id)
  )
);

-- Paneles conocidos hoy (mismos nombres que usa el scraper).
INSERT INTO paneles (nombre, tipo, mooneymaker_usuario, orden, is_active) VALUES
  ('AGENTE J',            'socio',    'agentej',                 1, TRUE),
  ('TANO',                'socio',    'agentetano',              2, TRUE),
  ('SOCL',                'socio',    'agentesocl',              3, TRUE),
  ('AGENTE NAHU',         'socio',    'N&CFernandez',            4, TRUE),
  ('SOC MAESTRA',         'socio',    'SociedadMaestra',         5, TRUE),
  ('BETPINAR',            'socio',    'betpinar',                6, TRUE),
  ('AGENTEKOB',           'socio',    NULL,                      7, FALSE),
  ('M01',                 'socio',    NULL,                      8, FALSE),
  ('AGENTE PERRO',        'socio',    NULL,                      9, FALSE),
  ('PublicidadMo',        'personal', 'PublicidadMo',           20, TRUE),
  ('AGENTEMADRE',         'personal', 'agentemadre',            21, TRUE),
  ('DISTRIPUBLI',         'personal', 'DistripubliL',           22, TRUE),
  ('PUBLICIDADGENERAL32', 'personal', 'PUBLICIDADGENERAL32',    23, TRUE),
  ('ADMIN',               'control',  'Admin',                  90, TRUE),
  ('AGENTEMC',            'control',  'AgenteMC',               91, TRUE)
ON CONFLICT (nombre) DO NOTHING;

-- Noviembre 2026, tal como está en la planilla BALANCE.
INSERT INTO socios_mes (mes, factura_usd, cotizacion, pct_fichas_pactado, pct_cef_socio)
VALUES ('2026-11-01', 5215, 1782, 0.18, 0.0225)
ON CONFLICT (mes) DO NOTHING;

INSERT INTO panel_config_mes (mes, panel_id, pct_ggr_socio, pct_ggr_casa, pct_ggr_nexo,
                              pct_costos_socio, pct_costos_casa, pct_costos_nexo, nexo_panel_id, empleados)
SELECT '2026-11-01'::date, p.id, c.gs, c.gc, c.gn, c.cs, c.cc, c.cn,
       (SELECT id FROM paneles WHERE nombre = c.nexo), c.emp
  FROM (VALUES
    ('AGENTE J',     0.7, 0.3, 0.0, 0.5, 0.5,   0.0,   NULL,           950000),
    ('TANO',         0.7, 0.2, 0.1, 0.5, 0.334, 0.166, 'AGENTE PERRO', 1500000),
    ('SOCL',         0.7, 0.3, 0.0, 0.5, 0.5,   0.0,   NULL,           950000),
    ('AGENTE NAHU',  0.5, 0.5, 0.0, 0.5, 0.5,   0.0,   NULL,           950000),
    ('SOC MAESTRA',  0.7, 0.3, 0.0, 0.5, 0.5,   0.0,   NULL,           950000),
    ('BETPINAR',     0.5, 0.5, 0.0, 0.5, 0.5,   0.0,   NULL,           1000000),
    ('AGENTEKOB',    0.5, 0.5, 0.0, 0.5, 0.5,   0.0,   NULL,           0),
    ('M01',          0.7, 0.3, 0.0, 0.5, 0.5,   0.0,   NULL,           0),
    ('AGENTE PERRO', 0.7, 0.3, 0.0, 0.5, 0.5,   0.0,   NULL,           0)
  ) AS c(nombre, gs, gc, gn, cs, cc, cn, nexo, emp)
  JOIN paneles p ON p.nombre = c.nombre
ON CONFLICT (mes, panel_id) DO NOTHING;
