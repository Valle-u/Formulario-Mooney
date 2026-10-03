-- Restaurar flags de Premio Pagado (migración 031 los insertó en true;
-- en staging quedaron en false y el form no muestra usuario_casino / horas premio).
UPDATE select_options
SET flag_usuario_casino = true,
    flag_premio_minimo = true,
    updated_at = NOW()
WHERE option_type = 'etiqueta'
  AND value = '[Unidad M] Premio Pagado';
