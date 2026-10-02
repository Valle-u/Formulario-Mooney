import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

function viewSecret(): string {
  if (env.RECEIPT_VIEW_SECRET) return env.RECEIPT_VIEW_SECRET;
  if (env.NODE_ENV !== "production") return "dev-receipt-view-secret";
  throw new Error("RECEIPT_VIEW_SECRET not configured");
}

function signPayload(scanId: string, expSec: number): string {
  return createHmac("sha256", viewSecret()).update(`${scanId}:${expSec}`).digest("base64url");
}

export function mintViewToken(scanId: string, ttlHours = env.RECEIPT_VIEW_TTL_HOURS): string {
  const expSec = Math.floor(Date.now() / 1000) + ttlHours * 3600;
  const sig = signPayload(scanId, expSec);
  return `${expSec}.${sig}`;
}

export function verifyViewToken(scanId: string, token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [expStr, sig] = parts;
    const expSec = Number(expStr);
    if (!Number.isFinite(expSec) || expSec < Math.floor(Date.now() / 1000)) return false;

    const expected = signPayload(scanId, expSec);
    const a = Buffer.from(sig ?? "");
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function buildViewUrl(scanId: string, token: string): string {
  const base = env.RECEIPT_PUBLIC_URL.replace(/\/$/, "");
  return `${base}/receipts/${encodeURIComponent(scanId)}?token=${encodeURIComponent(token)}`;
}
