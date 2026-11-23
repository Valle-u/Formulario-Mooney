import test from "node:test";
import assert from "node:assert/strict";
import { fechaValida, guardarIngesta, normalizarIngesta, parseMonto } from "../../src/services/panelesIngesta.js";
import { filasControlNetwin, filasHojaDia, serialAFecha } from "../../src/services/panelesPlanilla.js";

test("parseMonto acepta números y texto con formato argentino", () => {
  assert.equal(parseMonto(1867.3), 1867.3);
  assert.equal(parseMonto("1.867,30"), 1867.3);
  assert.equal(parseMonto("$ -135.229,00"), -135229);
  assert.equal(parseMonto("-135229"), -135229);
  assert.equal(parseMonto(""), undefined);
  assert.equal(parseMonto(null), undefined);
  assert.ok(Number.isNaN(parseMonto("abc")));
  assert.ok(Number.isNaN(parseMonto(1e20)));
  assert.ok(Number.isNaN(parseMonto("#N/A")));
});

test("fechaValida rechaza fechas que no existen o con basura", () => {
  assert.equal(fechaValida("2026-11-30"), true);
  assert.equal(fechaValida("2026-11-31"), false);
  assert.equal(fechaValida("2026-11-01' OR 1=1"), false);
  assert.equal(fechaValida(20261101), false);
});

test("normalizarIngesta valida el cuerpo del scraper", () => {
  const ok = normalizarIngesta({
    fecha: "2026-11-05",
    paneles: [
      { nombre: " agente  j ", netwin: 1700 },
      { nombre: "PublicidadMo", entrada: "177.194,00", salida: 51300, ops_entrada: 42 }
    ]
  });
  assert.equal(ok.fecha, "2026-11-05");
  assert.deepEqual(ok.filas[0], { nombre: "AGENTE J", valores: { netwin: 1700 } });
  assert.deepEqual(ok.filas[1].valores, { entrada: 177194, salida: 51300, ops_entrada: 42 });

  assert.match(normalizarIngesta({ fecha: "05/11/2026", paneles: [] }).error, /fecha/);
  assert.match(normalizarIngesta({ fecha: "2026-11-05", paneles: [] }).error, /vacío/);
  assert.match(normalizarIngesta({ fecha: "2026-11-05", paneles: [{ nombre: "TANO" }] }).error, /ningún dato/);
  assert.match(normalizarIngesta({ fecha: "2026-11-05", paneles: [{ nombre: "TANO", netwin: "x" }] }).error, /netwin inválido/);
  assert.match(normalizarIngesta({ fecha: "2026-11-05", paneles: [{ nombre: "TANO", ops_entrada: -1 }] }).error, /ops_entrada/);
  assert.match(
    normalizarIngesta({ fecha: "2026-11-05", paneles: [{ nombre: "TANO", netwin: 1 }, { nombre: "tano", netwin: 2 }] }).error,
    /repetido/
  );
});

test("guardarIngesta busca por nombre o usuario de MooneyMaker y no crea paneles", async () => {
  const llamadas = [];
  const client = {
    async query(sql, params) {
      llamadas.push({ sql, params });
      if (/SELECT id, nombre, mooneymaker_usuario/.test(sql)) {
        return { rows: [
          { id: 1, nombre: "AGENTE J", mooneymaker_usuario: "agentej" },
          { id: 12, nombre: "DISTRIPUBLI", mooneymaker_usuario: "DistripubliL" }
        ] };
      }
      return { rows: [] };
    }
  };
  const datos = normalizarIngesta({
    fecha: "2026-11-05",
    paneles: [
      { nombre: "agentej", netwin: 10 },
      { nombre: "DISTRIPUBLIL", entrada: 5 },
      { nombre: "NO EXISTE", netwin: 1 }
    ]
  });
  const r = await guardarIngesta(client, datos, "scraper");
  assert.deepEqual(r, { guardados: ["AGENTE J", "DISTRIPUBLI"], desconocidos: ["NO EXISTE"] });

  const inserts = llamadas.filter((l) => /INSERT INTO panel_diario/.test(l.sql));
  assert.equal(inserts.length, 2);
  // Lo que no vino va como NULL para que el COALESCE conserve el valor anterior.
  assert.deepEqual(inserts[0].params, ["2026-11-05", 1, 10, null, null, null, null, null, null, "scraper"]);
  assert.deepEqual(inserts[1].params, ["2026-11-05", 12, null, 5, null, null, null, null, null, "scraper"]);
});

test("filasHojaDia toma socios y paneles personales y saltea totales y encabezados", () => {
  const vacia = [];
  const matriz = [
    ["AGENTE J", 1867.3, 5000, 4000, 1000, 300, 700, "", 125.31, 112.5],
    ["NAHU", -135229, "#N/A", "#N/A"],
    ["TOTAL DIARIO", 425213.4, 1212590, 637000],
    vacia, vacia, vacia, vacia, vacia, vacia, vacia, vacia,
    ["PANELES PERSONALES", "INFORMACION GENERAL"],
    ["", "NETWIN", "ENTRADA", "SALIDA"],
    ["", "", "", "", "", "", "Depositos", "Retiros"],
    ["PublicidadMo", 140895.34, 177194, 51300, 42, 4, 4218.9, 12825, 0, 125894, 0],
    ["AGENTEMADRE", 640625.35, 1910890, 1755700, 219, 23, 8725.53, 76334.78, "#N/A", 155190, ""],
    ["TOTAL", 781520.69, 2088084, 1807000, 261, 27]
  ];
  assert.deepEqual(filasHojaDia(matriz), [
    { nombre: "AGENTE J", netwin: 1867.3, entrada: 5000, salida: 4000 },
    { nombre: "NAHU", netwin: -135229, entrada: undefined, salida: undefined },
    { nombre: "PublicidadMo", netwin: 140895.34, entrada: 177194, salida: 51300,
      ops_entrada: 42, ops_salida: 4, bonos: 0, inversion_publicidad: 0 },
    { nombre: "AGENTEMADRE", netwin: 640625.35, entrada: 1910890, salida: 1755700,
      ops_entrada: 219, ops_salida: 23, bonos: undefined, inversion_publicidad: undefined }
  ]);
});

test("CONTROL NETWIN DIARIO trae el netwin del admin y de AgenteMC por fecha", () => {
  assert.equal(serialAFecha(46327), "2026-11-01");
  assert.equal(serialAFecha("x"), null);
  assert.deepEqual(filasControlNetwin([
    [46327, 2079832.79, 870108.7, "=B2-C2"],
    [46349, "", ""],
    [46350, -145676.96, 362965.8]
  ]), {
    "2026-11-01": [{ nombre: "ADMIN", netwin: 2079832.79 }, { nombre: "AGENTEMC", netwin: 870108.7 }],
    "2026-11-24": [{ nombre: "ADMIN", netwin: -145676.96 }, { nombre: "AGENTEMC", netwin: 362965.8 }]
  });
});
