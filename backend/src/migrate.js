import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ ERROR: DATABASE_URL environment variable is not set");
  console.error("Please set it like this:");
  console.error("  export DATABASE_URL='postgresql://user:pass@host:port/db'");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
});

async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log("🔄 Starting database migrations...\n");

    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrationsDir = path.join(__dirname, "migrations");
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith(".sql"))
      .sort();

    console.log(`Found ${files.length} migration files\n`);

    for (const file of files) {
      const version = file.replace(".sql", "");

      // Check if migration already executed
      const result = await client.query(
        "SELECT * FROM schema_migrations WHERE version = $1",
        [version]
      );

      if (result.rows.length > 0) {
        console.log(`⏭️  Skipping ${file} (already executed)`);
        continue;
      }

      console.log(`🔄 Running migration: ${file}`);

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf8");

      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [version]
        );
        await client.query("COMMIT");
        console.log(`✅ Migration ${file} completed\n`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`❌ Migration ${file} failed:`, err.message);
        throw err;
      }
    }

    console.log("\n✅ All migrations completed successfully!");
  } catch (err) {
    console.error("\n❌ Migration process failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch(err => {
  console.error(err);
  process.exit(1);
});
