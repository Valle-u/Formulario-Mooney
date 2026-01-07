import express from "express";
import { query } from "../config/db.js";
import fs from "fs";
import path from "path";

const router = express.Router();

// Endpoint para EJECUTAR las migraciones
router.get('/run-migrations', async (req, res) => {
  try {
    const results = {
      timestamp: new Date().toISOString(),
      migrations: []
    };

    // Migración 014: Add Lemoncash y NaranjaX
    try {
      const sql014 = `
        ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_empresa_salida_check;
        ALTER TABLE egresos ADD CONSTRAINT egresos_empresa_salida_check
          CHECK (empresa_salida IN ('Telepagos', 'Copter', 'Palta', 'Personal Pay', 'Lemoncash', 'NaranjaX', 'TrustWallet'));
      `;

      await query(sql014);

      results.migrations.push({
        name: '014_add_lemoncash_naranjax',
        status: '✅ EJECUTADA',
        message: 'Agregadas Lemoncash, NaranjaX y TrustWallet al constraint de empresa_salida'
      });
    } catch (err) {
      results.migrations.push({
        name: '014_add_lemoncash_naranjax',
        status: '❌ ERROR',
        error: err.message
      });
    }

    // Migración 015: Fix status constraint (agregar 'editada')
    try {
      const sql015 = `
        ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_status_check;
        ALTER TABLE egresos ADD CONSTRAINT egresos_status_check
          CHECK (status IN ('activo', 'anulado', 'pendiente', 'editada'));
      `;

      await query(sql015);

      results.migrations.push({
        name: '015_fix_status_constraint',
        status: '✅ EJECUTADA',
        message: 'Agregado status "editada" al constraint - ESTO SOLUCIONA EL ERROR 500'
      });
    } catch (err) {
      results.migrations.push({
        name: '015_fix_status_constraint',
        status: '❌ ERROR',
        error: err.message
      });
    }

    // Migración 016: Add TrustWallet (ya incluida en 014, pero por si acaso)
    try {
      const sql016 = `
        ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_empresa_salida_check;
        ALTER TABLE egresos ADD CONSTRAINT egresos_empresa_salida_check
          CHECK (empresa_salida IN ('Telepagos', 'Copter', 'Palta', 'Personal Pay', 'Lemoncash', 'NaranjaX', 'TrustWallet'));
      `;

      await query(sql016);

      results.migrations.push({
        name: '016_add_trustwallet',
        status: '✅ EJECUTADA',
        message: 'TrustWallet confirmado en el constraint'
      });
    } catch (err) {
      results.migrations.push({
        name: '016_add_trustwallet',
        status: '❌ ERROR',
        error: err.message
      });
    }

    // Migración 017: Add Mercado Pago
    try {
      const sql017 = `
        ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_empresa_salida_check;
        ALTER TABLE egresos ADD CONSTRAINT egresos_empresa_salida_check
          CHECK (empresa_salida IN ('Telepagos', 'Copter', 'Palta', 'Personal Pay', 'Lemoncash', 'NaranjaX', 'TrustWallet', 'Mercado Pago'));
      `;

      await query(sql017);

      results.migrations.push({
        name: '017_add_mercado_pago',
        status: '✅ EJECUTADA',
        message: 'Mercado Pago agregado al constraint de empresa_salida'
      });
    } catch (err) {
      results.migrations.push({
        name: '017_add_mercado_pago',
        status: '❌ ERROR',
        error: err.message
      });
    }

    // Verificar estado final
    const statusCheck = await query(
      `SELECT pg_get_constraintdef(oid) as definition
       FROM pg_constraint
       WHERE conname = 'egresos_status_check'
       AND conrelid = 'egresos'::regclass`
    );

    const empresaCheck = await query(
      `SELECT pg_get_constraintdef(oid) as definition
       FROM pg_constraint
       WHERE conname = 'egresos_empresa_salida_check'
       AND conrelid = 'egresos'::regclass`
    );

    const allSuccess = results.migrations.every(m => m.status.includes('✅'));

    // Generar HTML
    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ejecución de Migraciones - Formulario Mooney</title>
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
      background: ${allSuccess ? '#d4edda' : '#f8d7da'};
      border-left: 4px solid ${allSuccess ? '#28a745' : '#dc3545'};
      padding: 15px;
      margin: 20px 0;
      font-size: 18px;
      font-weight: bold;
    }
    .migration {
      background: #f8f9fa;
      border-radius: 6px;
      padding: 15px;
      margin: 15px 0;
      border-left: 4px solid #007bff;
    }
    .migration.success {
      border-left-color: #28a745;
      background: #d4edda;
    }
    .migration.error {
      border-left-color: #dc3545;
      background: #f8d7da;
    }
    .migration h3 {
      margin-top: 0;
      color: #495057;
    }
    .verification {
      background: #e7f3ff;
      border: 2px solid #3498db;
      border-radius: 6px;
      padding: 20px;
      margin-top: 30px;
    }
    .verification h2 {
      margin-top: 0;
      color: #2c3e50;
    }
    .constraint {
      background: white;
      padding: 10px;
      border-radius: 4px;
      margin-top: 10px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      overflow-x: auto;
    }
    .next-step {
      background: #d4edda;
      border: 2px solid #28a745;
      border-radius: 6px;
      padding: 20px;
      margin-top: 30px;
    }
    .timestamp {
      color: #6c757d;
      font-size: 14px;
      margin-top: 20px;
    }
    .warning {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚙️ Ejecución de Migraciones</h1>

    <div class="summary">
      ${allSuccess ? '✅ TODAS LAS MIGRACIONES EJECUTADAS CORRECTAMENTE' : '❌ HUBO ERRORES EN ALGUNAS MIGRACIONES'}
    </div>

    ${results.migrations.map(migration => `
      <div class="migration ${migration.status.includes('✅') ? 'success' : 'error'}">
        <h3>${migration.name}</h3>
        <p><strong>Estado:</strong> ${migration.status}</p>
        <p>${migration.message || migration.error}</p>
      </div>
    `).join('')}

    <div class="verification">
      <h2>🔍 Verificación Final</h2>

      <h3>Constraint de Status:</h3>
      <div class="constraint">
        ${statusCheck.rows[0]?.definition || 'No encontrado'}
      </div>
      <p>${statusCheck.rows[0]?.definition.includes('editada') ? '✅ Contiene "editada"' : '❌ No contiene "editada"'}</p>

      <h3>Constraint de Empresa Salida:</h3>
      <div class="constraint">
        ${empresaCheck.rows[0]?.definition || 'No encontrado'}
      </div>
      <p>
        ${empresaCheck.rows[0]?.definition.includes('Lemoncash') ? '✅ Lemoncash ' : ''}
        ${empresaCheck.rows[0]?.definition.includes('NaranjaX') ? '✅ NaranjaX ' : ''}
        ${empresaCheck.rows[0]?.definition.includes('TrustWallet') ? '✅ TrustWallet' : ''}
      </p>
    </div>

    ${allSuccess ? `
      <div class="next-step">
        <h2>✅ Proceso Completado</h2>
        <p><strong>Las migraciones se ejecutaron correctamente.</strong></p>
        <p>El error 500 al editar egresos debería estar solucionado ahora.</p>
        <p style="margin-top: 15px;">
          <strong>Próximos pasos:</strong>
        </p>
        <ol>
          <li>Prueba editar un egreso para confirmar que funciona</li>
          <li>Elimina estos endpoints temporales por seguridad (/api/check-migrations y /api/run-migrations)</li>
        </ol>
      </div>
    ` : `
      <div class="warning">
        <h3>⚠️ Atención</h3>
        <p>Algunas migraciones fallaron. Revisa los errores arriba y contacta soporte si es necesario.</p>
      </div>
    `}

    <div class="timestamp">
      Ejecutado el: ${results.timestamp}
    </div>
  </div>
</body>
</html>
    `;

    res.send(html);

  } catch (error) {
    console.error('🔥 Error ejecutando migraciones:', error);
    res.status(500).send(`
      <h1>Error ejecutando migraciones</h1>
      <pre>${error.message}</pre>
      <pre>${error.stack}</pre>
    `);
  }
});

export default router;
