import crypto from "crypto";

export const API_KEY_PREFIX = "mmk_";
export const API_KEY_BYTES = 32;
export const ALLOWED_SCOPES = ["export:egresos"];
export const DEFAULT_SCOPES = ["export:egresos"];

export function generateApiKey() {
  const secret = crypto.randomBytes(API_KEY_BYTES).toString("hex");
  const rawKey = `${API_KEY_PREFIX}${secret}`;
  return {
    rawKey,
    prefix: rawKey.slice(0, 12),
    hash: hashApiKey(rawKey)
  };
}

export function hashApiKey(rawKey) {
  return crypto.createHash("sha256").update(String(rawKey), "utf8").digest("hex");
}

export function looksLikeApiKey(value) {
  const key = String(value || "").trim();
  return key.startsWith(API_KEY_PREFIX) && key.length >= 20;
}

export function normalizeScopes(input) {
  const list = Array.isArray(input) ? input : DEFAULT_SCOPES;
  const unique = [...new Set(list.map((s) => String(s || "").trim()).filter(Boolean))];
  const valid = unique.filter((scope) => ALLOWED_SCOPES.includes(scope));
  return valid.length ? valid : [...DEFAULT_SCOPES];
}

export function hasScope(scopes, required) {
  const list = Array.isArray(scopes) ? scopes : [];
  return list.includes(required);
}
