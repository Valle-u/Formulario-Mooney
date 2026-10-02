/** Smoke unitario de isTransientAiError / withAiRetry. `npx tsx scripts/test-ai-retry.ts` */
import { isTransientAiError, withAiRetry } from "../src/forensic/ai-retry.js";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK:", msg);
  }
}

assert(isTransientAiError(new Error("Anthropic API error: 529 {\"type\":\"overloaded_error\"}")), "529 overloaded");
assert(isTransientAiError(new Error("Anthropic API error: 429 rate_limit")), "429");
assert(isTransientAiError(new Error("fetch failed")), "fetch failed");
assert(!isTransientAiError(new Error("Anthropic API error: 401 invalid_api_key")), "401 not transient");
assert(!isTransientAiError(new Error("Claude no devolvió tool_use")), "logic error not transient");

let attempts = 0;
const result = await withAiRetry(
  "test",
  async () => {
    attempts++;
    if (attempts < 3) throw new Error("Anthropic API error: 529 Overloaded");
    return "ok";
  },
  { attempts: 3, baseDelayMs: 1 },
);
assert(result === "ok" && attempts === 3, "retries then succeeds");

try {
  await withAiRetry("test", async () => {
    throw new Error("Anthropic API error: 401 bad key");
  }, { attempts: 3, baseDelayMs: 1 });
  assert(false, "should have thrown 401");
} catch (e) {
  assert(e instanceof Error && e.message.includes("401"), "401 fails immediately");
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nall ok");
