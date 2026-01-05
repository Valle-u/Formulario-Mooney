/**
 * ENDPOINT TEMPORAL PARA EJECUTAR MIGRACIONES
 *
 * ⚠️ IMPORTANTE: ELIMINAR DESPUÉS DE EJECUTAR LAS MIGRACIONES
 *
 * Uso:
 * 1. Deploy a producción
 * 2. Ir a: https://tu-dominio.seenode.com/api/run-migrations-web
 * 3. Las migraciones se ejecutarán automáticamente
 * 4. ELIMINAR este archivo y quitar la ruta del server.js
 */

import express from 'express';
import { query, pool } from '../config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get('/run-migrations-web', async (req, res) => {
  const results = [];

  try {
    results.push('🚀 Iniciando migraciones...\n');

    // Migración 014: Lemoncash y NaranjaX
    try {
      results.push('📝 Ejecutando migración 014: Lemoncash y NaranjaX...');

      await query(`
        ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_empresa_salida_check;

        ALTER TABLE egresos ADD CONSTRAINT egresos_empresa_salida_check
          CHECK (empresa_salida IN ('Telepagos', 'Copter', 'Palta', 'Personal Pay', 'Lemoncash', 'NaranjaX'));

        COMMENT ON CONSTRAINT egresos_empresa_salida_check ON egresos
          IS 'Empresas permitidas: Telepagos, Copter, Palta, Personal Pay, Lemoncash, NaranjaX';
      `);

      results.push('✅ Migración 014 completada\n');
    } catch (error) {
      results.push(`❌ Error en migración 014: ${error.message}\n`);
    }

    // Migración 015: Fix status constraint (CRÍTICA)
    try {
      results.push('📝 Ejecutando migración 015: Fix status constraint (CRÍTICA)...');

      await query(`
        ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_status_check;

        ALTER TABLE egresos ADD CONSTRAINT egresos_status_check
          CHECK (status IN ('activo', 'anulado', 'pendiente', 'editada'));

        COMMENT ON CONSTRAINT egresos_status_check ON egresos
          IS 'Estados permitidos: activo, anulado, pendiente, editada';
      `);

      results.push('✅ Migración 015 completada (CRÍTICA - ahora podés editar egresos)\n');
    } catch (error) {
      results.push(`❌ Error en migración 015: ${error.message}\n`);
    }

    // Migración 016: TrustWallet
    try {
      results.push('📝 Ejecutando migración 016: TrustWallet...');

      await query(`
        ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_empresa_salida_check;

        ALTER TABLE egresos ADD CONSTRAINT egresos_empresa_salida_check
          CHECK (empresa_salida IN ('Telepagos', 'Copter', 'Palta', 'Personal Pay', 'Lemoncash', 'NaranjaX', 'TrustWallet'));

        COMMENT ON CONSTRAINT egresos_empresa_salida_check ON egresos
          IS 'Empresas permitidas: Telepagos, Copter, Palta, Personal Pay, Lemoncash, NaranjaX, TrustWallet';
      `);

      results.push('✅ Migración 016 completada\n');
    } catch (error) {
      results.push(`❌ Error en migración 016: ${error.message}\n`);
    }

    // Verificar resultados
    results.push('\n🔍 Verificando configuración final...');

    const checkConstraints = await query(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conname IN ('egresos_empresa_salida_check', 'egresos_status_check')
      ORDER BY conname
    `);

    results.push('\n📊 Constraints actuales:');
    checkConstraints.rows.forEach(row => {
      results.push(`  - ${row.conname}:`);
      results.push(`    ${row.definition}\n`);
    });

    results.push('\n✅ ¡MIGRACIONES COMPLETADAS EXITOSAMENTE!');
    results.push('\n⚠️  IMPORTANTE: Ahora debés ELIMINAR este endpoint por seguridad.');
    results.push('    1. Eliminar: backend/src/routes/run-migrations-web.js');
    results.push('    2. Eliminar la línea que importa esta ruta en server.js');
    results.push('    3. Hacer commit y deploy\n');

    // Responder con HTML formateado
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Migraciones Ejecutadas</title>
        <style>
          body {
            font-family: monospace;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #1e1e1e;
            color: #00ff00;
          }
          pre {
            background: #000;
            padding: 20px;
            border-radius: 8px;
            overflow-x: auto;
            white-space: pre-wrap;
          }
          .success { color: #00ff00; }
          .error { color: #ff0000; }
          .warning { color: #ffaa00; }
        </style>
      </head>
      <body>
        <h1>🚀 Resultado de Migraciones</h1>
        <pre>${results.join('\n')}</pre>
      </body>
      </html>
    `;

    res.send(html);

  } catch (error) {
    results.push(`\n❌ ERROR FATAL: ${error.message}`);
    results.push(error.stack);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error en Migraciones</title>
        <style>
          body {
            font-family: monospace;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #1e1e1e;
            color: #ff0000;
          }
          pre {
            background: #000;
            padding: 20px;
            border-radius: 8px;
            overflow-x: auto;
            white-space: pre-wrap;
          }
        </style>
      </head>
      <body>
        <h1>❌ Error en Migraciones</h1>
        <pre>${results.join('\n')}</pre>
      </body>
      </html>
    `;

    res.status(500).send(html);
  }
});

export default router;
