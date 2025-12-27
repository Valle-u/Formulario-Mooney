import { pool } from './src/config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log('🔄 Ejecutando migración 010_add_currency_support.sql...\n');

    const migrationPath = path.join(__dirname, 'src/migrations/010_add_currency_support.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await pool.query(sql);

    console.log('✅ Migración ejecutada correctamente!\n');

    // Verificar que se agregó la columna
    const check = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'egresos' AND column_name = 'moneda'
    `);

    if (check.rows.length > 0) {
      console.log('✅ Columna "moneda" agregada correctamente:');
      console.table(check.rows);
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error ejecutando migración:', error.message);
    process.exit(1);
  }
}

runMigration();
