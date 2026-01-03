import { Router } from "express";
import { auth } from "../middleware/auth.js";

const router = Router();

// Almacenar clientes conectados
const clients = new Map();

/**
 * GET /api/notifications/stream
 * Establece conexión SSE (Server-Sent Events) para notificaciones en tiempo real
 */
router.get("/stream", auth, (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  // Configurar headers para SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Nginx compatibility

  // Enviar comentario inicial para mantener conexión
  res.write(":ok\\n\\n");

  // Almacenar cliente
  const clientId = `${userId}_${Date.now()}`;
  clients.set(clientId, {
    userId,
    userRole,
    response: res,
    connectedAt: new Date()
  });

  console.log(`📡 Cliente conectado: User ${userId} (${userRole}) - Total: ${clients.size}`);

  // Enviar evento de conexión exitosa
  res.write(`data: ${JSON.stringify({
    type: "connected",
    message: "Conectado a notificaciones en tiempo real",
    timestamp: new Date().toISOString()
  })}\\n\\n`);

  // Cleanup cuando se desconecta
  req.on("close", () => {
    clients.delete(clientId);
    console.log(`📡 Cliente desconectado: User ${userId} - Total: ${clients.size}`);
  });
});

/**
 * Enviar notificación a usuarios específicos
 * @param {Object} notification - Objeto de notificación
 * @param {Array|null} targetUserIds - IDs de usuarios destino (null = todos)
 * @param {Array|null} targetRoles - Roles de usuarios destino (null = todos)
 */
function sendNotification(notification, targetUserIds = null, targetRoles = null) {
  let count = 0;

  for (const [clientId, client] of clients.entries()) {
    // Filtrar por usuarios específicos si se proporciona
    if (targetUserIds && !targetUserIds.includes(client.userId)) {
      continue;
    }

    // Filtrar por roles específicos si se proporciona
    if (targetRoles && !targetRoles.includes(client.userRole)) {
      continue;
    }

    try {
      client.response.write(`data: ${JSON.stringify({
        ...notification,
        timestamp: new Date().toISOString()
      })}\\n\\n`);
      count++;
    } catch (error) {
      console.error(`❌ Error enviando notificación a cliente ${clientId}:`, error.message);
      clients.delete(clientId);
    }
  }

  console.log(`📨 Notificación enviada a ${count} cliente(s)`);
  return count;
}

/**
 * Obtener número de clientes conectados
 */
function getConnectedClientsCount() {
  return clients.size;
}

/**
 * Obtener clientes conectados por rol
 */
function getConnectedClientsByRole() {
  const byRole = {};
  for (const client of clients.values()) {
    byRole[client.userRole] = (byRole[client.userRole] || 0) + 1;
  }
  return byRole;
}

export default router;
export { sendNotification, getConnectedClientsCount, getConnectedClientsByRole };
