-- Migración 018: Actualizar etiquetas de egresos
-- 1. Eliminar "Gasto Personal F" cambiándolo a "Gasto Personal"
-- 2. Corregir "Gasto Personl A" a "Gasto Personal A"
-- Fecha: 2026-01-20

BEGIN;

-- Actualizar registros con "Gasto Personal F" a "Gasto Personal"
UPDATE egresos
SET etiqueta = 'Gasto Personal'
WHERE etiqueta = 'Gasto Personal F';

-- Corregir typo "Gasto Personl A" a "Gasto Personal A"
UPDATE egresos
SET etiqueta = 'Gasto Personal A'
WHERE etiqueta = 'Gasto Personl A';

-- Nota: "Inversion Reca" es una nueva etiqueta que se agregó al frontend
-- pero no requiere migración de datos ya que no existía previamente

COMMIT;
