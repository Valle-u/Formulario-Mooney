import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false
});

async function checkConstraints() {
  const client = await pool.connect();
  try {
    console.log('🔍 Verificando constraints en la tabla egresos...\n');

    // Verificar índices UNIQUE
    const indexes = await client.query(`
      SELECT
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'egresos'
      AND indexdef LIKE '%UNIQUE%'
    `);

    console.log('📊 Índices UNIQUE encontrados:');
    if (indexes.rows.length === 0) {
      console.log('❌ NO SE ENCONTRARON ÍNDICES UNIQUE');
    } else {
      indexes.rows.forEach(row => {
        console.log(`\n✅ ${row.indexname}:`);
        console.log(`   ${row.indexdef}`);
      });
    }

    // Verificar constraints
    const constraints = await client.query(`
      SELECT
        conname as constraint_name,
        contype as constraint_type,
        pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = 'egresos'::regclass
    `);

    console.log('\n\n📋 Constraints en la tabla egresos:');
    constraints.rows.forEach(row => {
      const types = {
        'p': 'PRIMARY KEY',
        'f': 'FOREIGN KEY',
        'c': 'CHECK',
        'u': 'UNIQUE'
      };
      console.log(`\n${types[row.constraint_type] || row.constraint_type}: ${row.constraint_name}`);
      console.log(`   ${row.definition}`);
    });

    console.log('\n✅ Verificación completada');
  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

checkConstraints().catch(err => {
  console.error(err);
  process.exit(1);
});
