-- Planilla de balance (spreadsheet) de cada mes. Se carga desde Socios y
-- tiene prioridad sobre BALANCE_DEF_SHEETS / BALANCE_DEF_SHEET_ID. De ahí se
-- leen el balance bancario, el flujo de caja y la auditoría del mes.
CREATE TABLE IF NOT EXISTS planillas_mes (
  mes              DATE PRIMARY KEY CHECK (EXTRACT(DAY FROM mes) = 1),
  balance_id       VARCHAR(100) NOT NULL,
  titulo           TEXT,
  actualizado_por  BIGINT REFERENCES users(id),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Las del historial del scraper (julio y agosto no están).
INSERT INTO planillas_mes (mes, balance_id, titulo) VALUES
  ('2026-05-01', '1sgnC2RAh_iRPV_cOIXDZSZz7WiTH1qwNlzY4Q7K5lK8', 'BALANCE - MAYO - 2026'),
  ('2026-06-01', '1PJl5mncZkoxEAaz1Jfuw_2B45tROzHSNiyRbiux7S40', 'BALANCE - JUNIO - 2026'),
  ('2026-09-01', '13gsiEu1SPNdOix7PSJAd55k1Tnh5jZGFkk_hdtfek9U', 'BALANCE - SEPTIEMBRE - 2026'),
  ('2026-10-01', '1RO0RqgMePbyKRRpTU18mBgk19lnlw6nyMS1Q59hIF1c', 'BALANCE - OCTUBRE - 2026'),
  ('2026-11-01', '1UYDkzRap-QI0Py4nqCxhDzWP7tyPR5ODL1keJG_rCNQ', 'BALANCE - NOVIEMBRE - 2026')
ON CONFLICT (mes) DO NOTHING;
