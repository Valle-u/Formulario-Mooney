import { pool } from '../../src/config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log('🔄 Ejecutando migración 011_update_user_roles.sql...\n');

    const migrationPath = path.join(__dirname, '../../src/migrations/011_update_user_roles.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await pool.query(sql);

    console.log('✅ Migración ejecutada correctamente!\n');

    // Verificar los roles actualizados
    const check = await pool.query(`
      SELECT role, COUNT(*) as count
      FROM users
      GROUP BY role
      ORDER BY role
    `);

    console.log('✅ Roles actualizados en la tabla users:');
    console.table(check.rows);

    await pool.end();
  } catch (error) {
    console.error('❌ Error ejecutando migración:', error.message);
    process.exit(1);
  }
}

runMigration();
