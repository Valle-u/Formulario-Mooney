import { authAllowQueryToken, requireAdmin } from "./auth.js";

/**
 * Los endpoints de mantenimiento (/api/init-admin, /api/fix-id-transferencia,
 * /api/check-migrations, /api/run-migrations) ejecutan DDL sobre la base de
 * producción. Quedan deshabilitados salvo que se active explícitamente
 * ENABLE_MAINTENANCE_ENDPOINTS=true, y aun así exigen un admin autenticado.
 *
 * Para habilitarlos temporalmente: setear la variable, usar el endpoint y
 * volver a quitarla.
 */
export function maintenanceEnabled() {
  return String(process.env.ENABLE_MAINTENANCE_ENDPOINTS || "").toLowerCase() === "true";
}

function requireMaintenanceFlag(req, res, next) {
  if (!maintenanceEnabled()) {
    return res.status(404).json({
      message: "Endpoint de mantenimiento deshabilitado. Setear ENABLE_MAINTENANCE_ENDPOINTS=true para habilitarlo."
    });
  }
  return next();
}

/**
 * Flag + admin autenticado. Para endpoints que modifican el esquema.
 * Acepta ?token= porque se abren directo desde el navegador.
 */
export const maintenanceGuard = [requireMaintenanceFlag, authAllowQueryToken, requireAdmin];

/**
 * Solo flag, sin auth. Reservado para el bootstrap inicial del primer admin,
 * donde todavía no existe ningún usuario con el que autenticarse.
 */
export const bootstrapGuard = [requireMaintenanceFlag];
