import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { query, pool } from "../src/config/db.js";
import { validatePasswordStrength } from "../src/utils/validators.js";

dotenv.config();

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME || "admin";
  const password = process.env.SEED_ADMIN_PASSWORD;
  const fullName = process.env.SEED_ADMIN_FULLNAME || "Administrador";

  if (!password) {
    console.error("❌ Falta SEED_ADMIN_PASSWORD en el entorno.");
    console.error("   Definila antes de correr el seed; no hay contraseña por defecto.");
    process.exitCode = 1;
    return;
  }

  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    console.error(`❌ SEED_ADMIN_PASSWORD inválida: ${passwordError}`);
    process.exitCode = 1;
    return;
  }

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

  console.log("Admin creado:", r.rows[0]);
  console.log("La contraseña es la de SEED_ADMIN_PASSWORD. Cambiala después del primer login.");
}

main()
  .catch(e => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
