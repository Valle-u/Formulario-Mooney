import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

// Configuración del pool optimizada para alto volumen
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Número mínimo de conexiones mantenidas abiertas
  min: parseInt(process.env.PG_POOL_MIN || "10"),
  // Número máximo de conexiones simultáneas
  max: parseInt(process.env.PG_POOL_MAX || "40"),
  // Tiempo máximo que una conexión puede estar inactiva antes de cerrarse (30 segundos)
  idleTimeoutMillis: 30000,
  // Tiempo máximo de espera para obtener una conexión del pool (5 segundos)
  connectionTimeoutMillis: 5000,
});

export async function query(text, params) {
  return pool.query(text, params);
}
