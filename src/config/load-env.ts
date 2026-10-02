import { existsSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

/** Raíz del vault local (fuera de git). Override: CREDENCIALES_ROOT */
export function defaultCredencialesRoot(): string {
  if (process.env.CREDENCIALES_ROOT) return process.env.CREDENCIALES_ROOT;
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  return path.join(home, "Desktop", "credenciales");
}

/** Rutas en orden de prioridad para cargar secretos del gate. */
export function credentialEnvCandidates(): string[] {
  const root = defaultCredencialesRoot();
  return [
    process.env.CREDENCIALES_FILE,
    path.join(root, "GATE", "local.env"),
    path.join(root, "receipt-gate.env"),
    path.resolve("seenode.staging.env"),
    path.resolve(".env"),
  ].filter((p): p is string => Boolean(p));
}

/** Carga el primer archivo de credenciales existente. Idempotente si ya hay env. */
export function loadCredentialEnv(): string | undefined {
  for (const candidate of credentialEnvCandidates()) {
    if (!existsSync(candidate)) continue;
    dotenv.config({ path: candidate, override: false });
    return candidate;
  }
  dotenv.config();
  return undefined;
}

loadCredentialEnv();
