-- Migration 011: Actualizar sistema de roles
-- Fecha: 2025-12-27
-- Nuevos roles: admin, direccion, encargado, empleado

-- Primero, eliminar el constraint anterior de roles
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_role_check;
  END IF;
END $$;

-- Agregar nuevo constraint con los 4 roles
ALTER TABLE users
ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'direccion', 'encargado', 'empleado'));

-- Actualizar roles existentes: 'cajero' pasa a ser 'empleado'
UPDATE users
SET role = 'empleado'
WHERE role = 'cajero';

-- Comentarios
COMMENT ON COLUMN users.role IS 'Rol del usuario: admin (único, control total), direccion (mismos permisos que admin, distinguible en logs), encargado (puede ver logs, no puede editar), empleado (solo crear y ver egresos)';
