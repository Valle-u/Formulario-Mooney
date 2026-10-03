-- Dedup de comprobante por contenido (sha256 del archivo subido).
-- Complementa el unique (empresa, id_transferencia): el mismo JPG con otro ID no debe pasar.
ALTER TABLE egresos
  ADD COLUMN IF NOT EXISTS comprobante_sha256 TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS egresos_unique_comprobante_sha256
  ON egresos (comprobante_sha256)
  WHERE comprobante_sha256 IS NOT NULL
    AND status IS DISTINCT FROM 'anulado';

COMMENT ON COLUMN egresos.comprobante_sha256 IS
  'SHA-256 hex del archivo de comprobante; evita re-cargar el mismo archivo aunque cambie el ID.';
