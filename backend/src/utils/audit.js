import { query } from "../config/db.js";

function getIp(req){
  // req.ip ya resuelve X-Forwarded-For según el 'trust proxy' configurado, así
  // que no se puede falsear agregando el header a mano. Solo se lee el header
  // crudo si Express no pudo resolver nada.
  if (req.ip) return req.ip;
  const xf = req.headers["x-forwarded-for"];
  if (xf) return String(xf).split(",")[0].trim();
  return req.connection?.remoteAddress || "";
}

export async function auditLog(req, {
  action,
  entity = null,
  entity_id = null,
  success = true,
  status_code = null,
  details = null,
  actor = null
}) {
  const actor_user_id = actor?.id ?? req.user?.id ?? null;
  const actor_username = actor?.username ?? req.user?.username ?? null;
  const actor_role = actor?.role ?? req.user?.role ?? null;

  const ip = getIp(req);
  const user_agent = req.headers["user-agent"] || "";

  try {
    await query(
      `INSERT INTO audit_logs
        (actor_user_id, actor_username, actor_role, action, entity, entity_id, success, status_code, ip, user_agent, details)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        actor_user_id,
        actor_username,
        actor_role,
        action,
        entity,
        entity_id,
        !!success,
        status_code,
        ip,
        user_agent,
        details ? JSON.stringify(details) : null
      ]
    );
  } catch (err) {
    // Audit log nunca debe bloquear operaciones del negocio
    console.error(`⚠️  auditLog falló (${action}):`, err.message);
  }
}
