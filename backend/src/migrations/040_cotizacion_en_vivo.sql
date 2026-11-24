-- La cotización de noviembre se toma en vivo (CriptoYa, igual que la
-- planilla): se borra el valor de prueba que dejó la migración 037.
UPDATE socios_mes SET cotizacion = NULL
 WHERE mes = DATE '2026-11-01' AND cotizacion = 1782;
