import { query } from "../config/db.js";

function getIp(req){
  // soporte proxy si existe, sino req.ip
  const xf = req.headers["x-forwarded-for"];
  if (xf) return String(xf).split(",")[0].trim();
  return req.ip || req.connection?.remoteAddress || "";
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
}
