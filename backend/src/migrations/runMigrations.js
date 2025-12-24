import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log("🔧 Running database migrations...");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT NOW()
    );
  `);

  const executed = await pool.query("SELECT filename FROM schema_migrations");
  const executedFiles = new Set(executed.rows.map(r => r.filename));

  const sqlDir = __dirname;
  const files = fs.readdirSync(sqlDir)
    .filter(f => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (executedFiles.has(file)) continue;

    console.log(`➡️ Applying migration: ${file}`);
    const sql = fs.readFileSync(path.join(sqlDir, file), "utf-8");

    try {
      await pool.query(sql);
      await pool.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [file]
      );
      console.log(`✅ Migration applied: ${file}`);
    } catch (err) {
      console.error(`❌ Migration failed: ${file}`);
      console.error("Code:", err?.code);
      console.error("Message:", err?.message);
      console.error("Detail:", err?.detail);
      console.error("Hint:", err?.hint);
      console.error("Where:", err?.where);
      throw err;
    }
  }

  console.log("✅ Database migrations finished");
}
