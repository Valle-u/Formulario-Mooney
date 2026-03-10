-- Fix: codigo_operacion debe permitir NULL durante el INSERT
-- El código genera el código DESPUÉS del INSERT (necesita el ID), luego hace UPDATE
ALTER TABLE egresos ALTER COLUMN codigo_operacion DROP NOT NULL;
