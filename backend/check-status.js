import { pool } from './src/config/db.js';

async function checkStatus() {
  try {
    console.log('🔍 Verificando estados en la base de datos...\n');

    // Ver todos los estados únicos
    const statusQuery = await pool.query(`
      SELECT DISTINCT status, COUNT(*) as count
      FROM egresos
      GROUP BY status
      ORDER BY count DESC
    `);

    console.log('📊 Estados encontrados en la tabla egresos:');
    console.table(statusQuery.rows);

    // Ver algunos ejemplos
    const examples = await pool.query(`
      SELECT id, fecha, id_transferencia, status
      FROM egresos
      ORDER BY id DESC
      LIMIT 10
    `);

    console.log('\n📋 Últimos 10 egresos:');
    console.table(examples.rows);

    // Ver si hay NULLs
    const nullCount = await pool.query(`
      SELECT COUNT(*) as count
      FROM egresos
      WHERE status IS NULL
    `);

    console.log(`\n⚠️  Egresos con status NULL: ${nullCount.rows[0].count}`);

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkStatus();
