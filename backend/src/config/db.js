import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

// Configuración del pool optimizada para alto volumen y mantener conexiones vivas
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // SSL requerido para conexiones en producción (Seenode, Heroku, etc.)
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  // Número mínimo de conexiones mantenidas abiertas
  min: parseInt(process.env.PG_POOL_MIN || "2"),
  // Número máximo de conexiones simultáneas (reducido para cloud hosting)
  max: parseInt(process.env.PG_POOL_MAX || "10"),
  // Tiempo máximo que una conexión puede estar inactiva antes de cerrarse (30 segundos)
  idleTimeoutMillis: 30000,
  // Tiempo máximo de espera para obtener una conexión del pool (5 segundos)
  connectionTimeoutMillis: 5000,
  // Configuración de keepAlive para mantener conexiones TCP vivas
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000, // Enviar primer keepalive después de 10s
  // Permitir que el pool intente reconectarse automáticamente
  allowExitOnIdle: false
});

// Manejar errores de conexión del pool
pool.on('error', (err, client) => {
  console.error('❌ Error inesperado en el pool de PostgreSQL:', err);
  console.error('   Cliente:', client ? 'activo' : 'inactivo');
  // No terminar el proceso, dejar que el pool intente reconectar
});

// Log cuando se conecta un nuevo cliente
pool.on('connect', (client) => {
  console.log('✅ Nueva conexión establecida al pool de PostgreSQL');
});

// Log cuando se elimina un cliente
pool.on('remove', (client) => {
  console.log('🔌 Conexión removida del pool de PostgreSQL');
});

export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log solo queries lentas (más de 1 segundo) para no saturar logs
    if (duration > 1000) {
      console.log(`⏱️  Query lenta (${duration}ms):`, text.substring(0, 100));
    }

    return result;
  } catch (error) {
    console.error('❌ Error en query:', error.message);
    console.error('   Query:', text.substring(0, 100));

    // Si es error de conexión, intentar reconectar
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.log('🔄 Intentando reconectar a la base de datos...');
      // El pool manejará la reconexión automáticamente
    }

    throw error;
  }
}
