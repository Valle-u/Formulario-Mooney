-- 004_fix_turno_check.sql
-- Arregla el CHECK del turno para que no dependa del encoding de "ñ"
-- y para que ignore espacios adelante/atrás.

ALTER TABLE egresos
  DROP CONSTRAINT IF EXISTS egresos_turno_check;

ALTER TABLE egresos
  ADD CONSTRAINT egresos_turno_check
  CHECK (
    btrim(turno) ~* '^Turno (mañana|manana|tarde|noche)$'
  ) NOT VALID;
