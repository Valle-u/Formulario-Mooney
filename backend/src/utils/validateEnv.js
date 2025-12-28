/**
 * Validate required environment variables at startup
 * Exits process if any required variable is missing
 */
export function validateRequiredEnv() {
  const required = [
    "DATABASE_URL",
    "JWT_SECRET"
  ];

  const missing = [];

  for (const envVar of required) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  // Validar JWT_SECRET tiene longitud mínima (seguridad)
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error("❌ JWT_SECRET debe tener al menos 32 caracteres");
    process.exit(1);
  }

  if (missing.length > 0) {
    console.error("❌ Variables de entorno requeridas faltantes:");
    missing.forEach(v => console.error(`  - ${v}`));
    console.error("\nCreá un archivo .env con estas variables antes de iniciar el servidor.");
    process.exit(1);
  }
}
