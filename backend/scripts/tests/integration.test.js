/**
 * Smoke / integración mínima contra un backend ya levantado.
 *
 * Requisitos:
 *   - API en TEST_BASE_URL (default http://127.0.0.1:4000)
 *   - Usuario admin con TEST_ADMIN_USER / TEST_ADMIN_PASSWORD
 *   - Opcional: TEST_EMPLEADO_USER / TEST_EMPLEADO_PASSWORD
 *
 * Correr: npm test
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const BASE = process.env.TEST_BASE_URL || "http://127.0.0.1:4000";
const ADMIN_USER = process.env.TEST_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.TEST_ADMIN_PASSWORD || "";
const EMP_USER = process.env.TEST_EMPLEADO_USER || "empleado_test";
const EMP_PASS = process.env.TEST_EMPLEADO_PASSWORD || "";

async function json(path, { method = "GET", token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; }
  catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

function tinyPng() {
  // 1x1 PNG válido
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
}

let adminToken = null;
let empToken = null;

before(async () => {
  const health = await fetch(`${BASE}/health`);
  assert.equal(health.status, 200, `API no responde en ${BASE}/health`);
});

describe("auth", () => {
  test("login falla con el mismo mensaje para user inexistente y pass mala", async () => {
    const a = await json("/api/auth/login", { method: "POST", body: { username: "noexiste_xyz", password: ["not","the","password"].join("-") } });
    const b = await json("/api/auth/login", { method: "POST", body: { username: ADMIN_USER, password: ["not","the","password"].join("-") } });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.data.message, b.data.message);
  });

  test("login admin ok", async () => {
    const r = await json("/api/auth/login", { method: "POST", body: { username: ADMIN_USER, password: ADMIN_PASS } });
    assert.equal(r.status, 200);
    assert.ok(r.data.token);
    adminToken = r.data.token;
  });

  test("login empleado ok (si existe)", async () => {
    const r = await json("/api/auth/login", { method: "POST", body: { username: EMP_USER, password: EMP_PASS } });
    if (r.status === 401) {
      // Entorno sin usuario de prueba: se salta el resto de permisos de empleado
      return;
    }
    assert.equal(r.status, 200);
    empToken = r.data.token;
  });
});

describe("mantenimiento eliminado", () => {
  test("endpoints con DDL hardcodeada ya no existen", async () => {
    for (const path of ["/api/run-migrations", "/api/check-migrations", "/api/init-admin"]) {
      const r = await json(path, { method: path.includes("init") ? "POST" : "GET" });
      assert.equal(r.status, 404, path);
    }
  });
});

describe("egresos", () => {
  test("listado requiere auth", async () => {
    const r = await json("/api/egresos");
    assert.equal(r.status, 401);
  });

  test("listado con admin", async () => {
    assert.ok(adminToken, "falta adminToken");
    const r = await json("/api/egresos?limit=5", { token: adminToken });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data.egresos));
    assert.ok(r.headers.get("ratelimit-limit"));
  });

  test("DELETE físico deshabilitado (usar anular)", async () => {
    assert.ok(adminToken, "falta adminToken");
    const list = await json("/api/egresos?limit=1", { token: adminToken });
    const id = list.data.egresos[0]?.id;
    if (!id) return;
    const r = await json(`/api/egresos/${id}`, { method: "DELETE", token: adminToken });
    assert.equal(r.status, 405);
  });

  test("rechaza archivo con magic number incorrecto", async () => {
    assert.ok(adminToken);
    const fd = new FormData();
    fd.set("data", JSON.stringify({
      fecha: "02/10/2026",
      hora: "12:00",
      turno: "Turno mañana",
      etiqueta: "[Unidad M] Pago de sueldo",
      moneda: "ARS",
      tipo_transaccion: "SALIDA",
      monto_transferencia_raw: "10,00",
      cuenta_receptora: "Test",
      cuenta_salida: "Caja",
      empresa_cuenta_salida: "Brubank",
      id_transferencia: `T${createHash("sha1").update(String(Date.now())).digest("hex").slice(0, 10)}`
    }));
    fd.set("comprobante", new Blob([Buffer.from("GIF89a....")], { type: "image/png" }), "fake.png");
    const r = await json("/api/egresos", { method: "POST", token: adminToken, formData: fd });
    assert.equal(r.status, 400);
    assert.match(String(r.data.message || ""), /no coincide|GIF|detectado/i);
  });

  test("alta con PNG real", async () => {
    assert.ok(adminToken);
    const idTransfer = `T${Date.now().toString(36)}`;
    const fd = new FormData();
    fd.set("data", JSON.stringify({
      fecha: "02/10/2026",
      hora: "12:30",
      turno: "Turno tarde",
      etiqueta: "[Unidad M] Pago de sueldo",
      moneda: "ARS",
      tipo_transaccion: "SALIDA",
      monto_transferencia_raw: "25,50",
      cuenta_receptora: "Test",
      cuenta_salida: "Caja",
      empresa_cuenta_salida: "Brubank",
      id_transferencia: idTransfer
    }));
    fd.set("comprobante", new Blob([tinyPng()], { type: "image/png" }), "ok.png");
    const r = await json("/api/egresos", { method: "POST", token: adminToken, formData: fd });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.ok(r.data.id);

    // Edición deja rastro con motivo
    const put = await json(`/api/egresos/${r.data.id}`, {
      method: "PUT",
      token: adminToken,
      body: { monto: 30, monto_raw: "30", change_reason: "Ajuste de prueba automatizada" }
    });
    assert.equal(put.status, 200, JSON.stringify(put.data));

    const hist = await json(`/api/egresos/${r.data.id}/history`, { token: adminToken });
    assert.equal(hist.status, 200);
    assert.ok(hist.data.changes.some(c => c.field_name === "monto" && c.change_reason));
  });

  test("csv export admin", async () => {
    assert.ok(adminToken);
    const res = await fetch(`${BASE}/api/egresos/csv`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes("empresa_salida") || text.includes("codigo_operacion"));
  });

  test("saldos admin", async () => {
    assert.ok(adminToken);
    const r = await json("/api/egresos/saldos?mes=10&anio=2026", { token: adminToken });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data.saldos));
  });
});
