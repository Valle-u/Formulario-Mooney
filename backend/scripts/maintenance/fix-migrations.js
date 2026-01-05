import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false
});

async function fix() {
  const client = await pool.connect();
  try {
    console.log('🔄 Dropping old schema_migrations table...');
    await client.query('DROP TABLE IF EXISTS schema_migrations');
    console.log('✅ Table dropped successfully');
    console.log('\nNow Seenode will run migrations from scratch on next deploy.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

fix().catch(err => {
  console.error(err);
  process.exit(1);
});
