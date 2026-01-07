import express from "express";
import { query } from "../config/db.js";

const router = express.Router();

// Endpoint para VERIFICAR el estado de las migraciones sin ejecutarlas
router.get('/check-migrations', async (req, res) => {
  try {
    const results = {
      timestamp: new Date().toISOString(),
      checks: []
    };

    // CHECK 1: Verificar si existe 'Lemoncash' en el constraint de empresa_salida
    try {
      const testLemoncash = await query(
        `SELECT conname, pg_get_constraintdef(oid) as definition
         FROM pg_constraint
         WHERE conname = 'egresos_empresa_salida_check'
         AND conrelid = 'egresos'::regclass`
      );

      const hasLemoncash = testLemoncash.rows.length > 0 &&
                           testLemoncash.rows[0].definition.includes('Lemoncash');
      const hasNaranjaX = testLemoncash.rows.length > 0 &&
                          testLemoncash.rows[0].definition.includes('NaranjaX');
      const hasTrustWallet = testLemoncash.rows.length > 0 &&
                             testLemoncash.rows[0].definition.includes('TrustWallet');
      const hasMercadoPago = testLemoncash.rows.length > 0 &&
                             testLemoncash.rows[0].definition.includes('Mercado Pago');

      results.checks.push({
        migration: '014_add_lemoncash_naranjax',
        status: hasLemoncash && hasNaranjaX ? '✅ EJECUTADA' : '❌ FALTANTE',
        details: {
          hasLemoncash,
          hasNaranjaX,
          currentDefinition: testLemoncash.rows[0]?.definition || 'No encontrado'
        }
      });

      results.checks.push({
        migration: '016_add_trustwallet',
        status: hasTrustWallet ? '✅ EJECUTADA' : '❌ FALTANTE',
        details: {
          hasTrustWallet,
          currentDefinition: testLemoncash.rows[0]?.definition || 'No encontrado'
        }
      });

      results.checks.push({
        migration: '017_add_mercado_pago',
        status: hasMercadoPago ? '✅ EJECUTADA' : '❌ FALTANTE',
        details: {
          hasMercadoPago,
          currentDefinition: testLemoncash.rows[0]?.definition || 'No encontrado'
        }
      });

    } catch (err) {
      results.checks.push({
        migration: '014_add_lemoncash_naranjax',
        status: '❌ ERROR',
        error: err.message
      });
    }

    // CHECK 2: Verificar si existe 'editada' en el constraint de status
    try {
      const testEditada = await query(
        `SELECT conname, pg_get_constraintdef(oid) as definition
         FROM pg_constraint
         WHERE conname = 'egresos_status_check'
         AND conrelid = 'egresos'::regclass`
      );

      const hasEditada = testEditada.rows.length > 0 &&
                         testEditada.rows[0].definition.includes('editada');

      results.checks.push({
        migration: '015_fix_status_constraint',
        status: hasEditada ? '✅ EJECUTADA' : '❌ FALTANTE - ESTA ES LA QUE CAUSA EL ERROR 500',
        details: {
          hasEditada,
          currentDefinition: testEditada.rows[0]?.definition || 'No encontrado'
        }
      });

    } catch (err) {
      results.checks.push({
        migration: '015_fix_status_constraint',
        status: '❌ ERROR',
        error: err.message
      });
    }

    // Resumen
    const allExecuted = results.checks.every(c => c.status.includes('✅'));
    results.summary = allExecuted
      ? '✅ TODAS LAS MIGRACIONES ESTÁN EJECUTADAS'
      : '⚠️ FALTAN MIGRACIONES POR EJECUTAR';

    // Generar HTML legible
    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Check Migraciones - Formulario Mooney</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      max-width: 900px;
      margin: 40px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 {
      color: #2c3e50;
      border-bottom: 3px solid #3498db;
      padding-bottom: 10px;
    }
    .summary {
      background: ${allExecuted ? '#d4edda' : '#fff3cd'};
      border-left: 4px solid ${allExecuted ? '#28a745' : '#ffc107'};
      padding: 15px;
      margin: 20px 0;
      font-size: 18px;
      font-weight: bold;
    }
    .check {
      background: #f8f9fa;
      border-radius: 6px;
      padding: 15px;
      margin: 15px 0;
      border-left: 4px solid #007bff;
    }
    .check.success {
      border-left-color: #28a745;
      background: #d4edda;
    }
    .check.error {
      border-left-color: #dc3545;
      background: #f8d7da;
    }
    .check h3 {
      margin-top: 0;
      color: #495057;
    }
    .details {
      background: white;
      padding: 10px;
      border-radius: 4px;
      margin-top: 10px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      overflow-x: auto;
    }
    .next-step {
      background: #e7f3ff;
      border: 2px solid #3498db;
      border-radius: 6px;
      padding: 20px;
      margin-top: 30px;
    }
    .next-step h2 {
      margin-top: 0;
      color: #2c3e50;
    }
    .next-step a {
      display: inline-block;
      background: #28a745;
      color: white;
      padding: 12px 24px;
      border-radius: 5px;
      text-decoration: none;
      font-weight: bold;
      margin-top: 10px;
    }
    .next-step a:hover {
      background: #218838;
    }
    .timestamp {
      color: #6c757d;
      font-size: 14px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 Verificación de Migraciones</h1>

    <div class="summary">
      ${results.summary}
    </div>

    ${results.checks.map(check => `
      <div class="check ${check.status.includes('✅') ? 'success' : 'error'}">
        <h3>${check.migration}</h3>
        <p><strong>Estado:</strong> ${check.status}</p>
        ${check.details ? `
          <div class="details">
            <pre>${JSON.stringify(check.details, null, 2)}</pre>
          </div>
        ` : ''}
        ${check.error ? `<p style="color: #dc3545;"><strong>Error:</strong> ${check.error}</p>` : ''}
      </div>
    `).join('')}

    ${!allExecuted ? `
      <div class="next-step">
        <h2>⚠️ Siguiente Paso</h2>
        <p>Hay migraciones pendientes que deben ejecutarse. Si falta la migración 015, esto está causando el error 500 al editar egresos.</p>
        <p><strong>Para ejecutar las migraciones:</strong></p>
        <a href="/api/run-migrations">▶️ EJECUTAR MIGRACIONES AHORA</a>
        <p style="margin-top: 15px; font-size: 14px; color: #6c757d;">
          ⚠️ Este proceso es seguro. Solo modifica los constraints de la base de datos, no borra ni modifica datos existentes.
        </p>
      </div>
    ` : `
      <div class="next-step" style="background: #d4edda; border-color: #28a745;">
        <h2>✅ Todo está correcto</h2>
        <p>Todas las migraciones están ejecutadas. La base de datos está actualizada.</p>
      </div>
    `}

    <div class="timestamp">
      Verificado el: ${results.timestamp}
    </div>
  </div>
</body>
</html>
    `;

    res.send(html);

  } catch (error) {
    console.error('🔥 Error verificando migraciones:', error);
    res.status(500).send(`
      <h1>Error al verificar migraciones</h1>
      <pre>${error.message}</pre>
    `);
  }
});

export default router;
