import assert from "assert";
import {
  generateApiKey,
  hashApiKey,
  looksLikeApiKey,
  normalizeScopes,
  hasScope,
  API_KEY_PREFIX
} from "../../src/utils/apiKeys.js";

function test(name, fn) {
  fn();
  console.log(`✅ ${name}`);
}

test("generateApiKey crea un secreto mmk_ de alta entropía", () => {
  const first = generateApiKey();
  const second = generateApiKey();

  assert.ok(first.rawKey.startsWith(API_KEY_PREFIX));
  assert.equal(first.rawKey.length, API_KEY_PREFIX.length + 64);
  assert.equal(first.prefix, first.rawKey.slice(0, 12));
  assert.notEqual(first.rawKey, second.rawKey);
  assert.notEqual(first.hash, second.hash);
  assert.equal(first.hash, hashApiKey(first.rawKey));
  assert.equal(first.hash.length, 64);
});

test("hashApiKey es determinista y no reversible a simple vista", () => {
  const { rawKey, hash } = generateApiKey();
  assert.equal(hashApiKey(rawKey), hash);
  assert.notEqual(hash, rawKey);
  assert.ok(!hash.includes(rawKey));
});

test("looksLikeApiKey valida el prefijo", () => {
  const { rawKey } = generateApiKey();
  assert.equal(looksLikeApiKey(rawKey), true);
  assert.equal(looksLikeApiKey("Bearer abc"), false);
  assert.equal(looksLikeApiKey("mmk_short"), false);
  assert.equal(looksLikeApiKey(""), false);
});

test("normalizeScopes descarta permisos desconocidos y usa default", () => {
  assert.deepEqual(normalizeScopes(["export:egresos", "admin:all"]), ["export:egresos"]);
  assert.deepEqual(normalizeScopes(["nope"]), ["export:egresos"]);
  assert.deepEqual(normalizeScopes(null), ["export:egresos"]);
});

test("hasScope chequea el permiso de export", () => {
  assert.equal(hasScope(["export:egresos"], "export:egresos"), true);
  assert.equal(hasScope(["export:egresos"], "users:write"), false);
  assert.equal(hasScope(null, "export:egresos"), false);
});

console.log("\nTodos los tests de API keys pasaron.");
