/**
 * Test de la edad del comprobante (MSG-PAM-20260812-8 §6). Correr: `npm run test:receipt-age`.
 *
 * Lo que se está protegiendo: `fecha` viene transcripta del comprobante en hora argentina y sin
 * sufijo de zona. Si se la parsea con `new Date()` en un proceso que corre en UTC, el comprobante
 * envejece 3 h y la ventana de 48 h se vuelve de 45. El test corre con TZ=UTC y con TZ=Argentina
 * para verificar que el resultado NO depende de la zona del host.
 */
import { receiptAgeHours, fechaToEpochMs } from "../src/forensic/validate.js";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detalle?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detalle ? ` — ${detalle}` : ""}`); }
}

// 2026-08-12 01:00:00 hora argentina == 04:00:00 UTC.
const AHORA = Date.UTC(2026, 7, 12, 10, 0, 0); // 10:00 UTC

function run() {
  console.log(`== zona del proceso: TZ=${process.env.TZ ?? "(sin setear)"} ==`);

  const edad = receiptAgeHours("2026-08-12 01:00:00", AHORA);
  check(
    "hora impresa 01:00 ART == 04:00 UTC → 6 h, no 9 h",
    edad === 6,
    `obtenido ${edad}`,
  );

  check(
    "el epoch se interpreta en UTC-3",
    fechaToEpochMs("2026-08-12 01:00:00") === Date.UTC(2026, 7, 12, 4, 0, 0),
  );

  check(
    "con sufijo Z manda la zona explícita del modelo",
    fechaToEpochMs("2026-08-12T04:00:00Z") === Date.UTC(2026, 7, 12, 4, 0, 0),
  );

  check(
    "con offset explícito -03:00 da el mismo instante",
    fechaToEpochMs("2026-08-12T01:00:00-03:00") === Date.UTC(2026, 7, 12, 4, 0, 0),
  );

  check("formato con T y sin segundos", fechaToEpochMs("2026-08-12T01:00") === Date.UTC(2026, 7, 12, 4, 0, 0));

  // Solo fecha: 00:00 ART es el instante más viejo del día → la edad sale máxima.
  check(
    "solo fecha → 00:00 ART (sesgo hacia revisión, no hacia acreditar)",
    fechaToEpochMs("2026-08-12") === Date.UTC(2026, 7, 12, 3, 0, 0),
  );

  check("null → null", receiptAgeHours(null, AHORA) === null);
  check("basura → null", receiptAgeHours("ayer a la tarde", AHORA) === null);
  check("cadena vacía → null", receiptAgeHours("", AHORA) === null);

  // El caso que le importa a PAM: 47 h de verdad no pueden leerse como 50.
  const casi48 = receiptAgeHours("2026-08-10 11:00:00", AHORA); // 14:00 UTC del 10 → 44 h
  check("comprobante de 44 h se mide en 44, no en 47", casi48 === 44, `obtenido ${casi48}`);

  // Fecha futura: se emite negativa en vez de taparla.
  const futuro = receiptAgeHours("2026-08-13 01:00:00", AHORA);
  check("fecha futura da edad negativa (es un dato, no un error)", futuro !== null && futuro < 0);

  console.log(`\n${passed} ok · ${failed} fallados`);
  if (failed > 0) process.exit(1);
}

run();
