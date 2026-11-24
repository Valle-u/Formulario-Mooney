-- DistriPablo cuelga de AgenteMC: su netwin ya está dentro del de AgenteMC.
-- Se guarda aparte para la escala de costo de fichas de cada autónomo.
INSERT INTO paneles (nombre, tipo, mooneymaker_usuario, orden, is_active)
VALUES ('DISTRIPABLO', 'control', 'DistriPablo', 92, TRUE)
ON CONFLICT (nombre) DO NOTHING;
