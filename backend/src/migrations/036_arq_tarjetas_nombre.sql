-- Nombre tal como figura impreso en la tarjeta ARQ.
ALTER TABLE arq_tarjetas
  ADD COLUMN IF NOT EXISTS nombre_tarjeta VARCHAR(80);
