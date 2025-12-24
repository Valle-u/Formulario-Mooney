import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { query, pool } from "../src/config/db.js";

dotenv.config();

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME || "admin";
  const password = process.env.SEED_ADMIN_PASSWORD || "admin123";
  const fullName = process.env.SEED_ADMIN_FULLNAME || "Administrador";

  // existe?
  const ex = await query("SELECT id FROM users WHERE username=$1", [username]);
  if (ex.rowCount > 0) {
    console.log("Admin ya existe:", username);
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const r = await query(
    `INSERT INTO users (username, password_hash, role, full_name, created_by)
     VALUES ($1,$2,'admin',$3,NULL)
     RETURNING id, username, role`,
    [username, hash, fullName]
  );

  console.log("Admin creado:", r.rows[0], "password:", password);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await pool.end();
  });
