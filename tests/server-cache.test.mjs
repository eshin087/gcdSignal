import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { load } from "./load-ts.mjs";
const { BoundedServerCache } = load("../lib/bounded-server-cache.ts");
const { rememberGood, recallGood } = load("../lib/last-good.ts");
const { sharedServerLoad } = load("../lib/server-cache.ts");
const { THEME_SCRIPT, TEXT_SCRIPT } = load("../lib/prepaint.ts");
const nextConfig = load("../next.config.ts").default;

test("server caches enforce both byte and entry limits and use LRU eviction", () => {
  const cache = new BoundedServerCache(2, 100, 50);
  cache.set("a", "one", 10000);
  cache.set("b", "two", 10000);
  assert.equal(cache.get("a"), "one");
  cache.set("c", "three", 10000);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.stats.entries, 2);
  assert.equal(cache.set("large", "x".repeat(51), 10000), false);
  assert.equal(cache.get("large"), undefined);
  const bytes = new BoundedServerCache(20, 30, 30);
  for (let i = 0; i < 20; i++) bytes.set(String(i), "1234567890", 10000);
  assert.ok(bytes.stats.serializedBytes <= 30);
  assert.ok(bytes.stats.entries <= 2);
});

test("server cache purges expired data and rejects unserializable values", () => {
  const cache = new BoundedServerCache(2, 100, 100);
  cache.set("expired", "one", -1);
  assert.equal(cache.get("expired"), undefined);
  assert.deepEqual(cache.stats, { entries: 0, serializedBytes: 0 });
  const circular = {}; circular.self = circular;
  assert.equal(cache.set("circular", circular, 10000), false);
});

test("last-good fallback is absent on cold/missing keys and expires after 24 hours", () => {
  assert.equal(recallGood("cold-instance-test"), null);
  const original = Date.now;
  let now = original();
  Date.now = () => now;
  try {
    rememberGood("last-good-test", { items: ["good"] });
    assert.deepEqual(recallGood("last-good-test").value, { items: ["good"] });
    now += 24 * 3600_000;
    assert.equal(recallGood("last-good-test"), null);
  } finally { Date.now = original; }
});

test("single-flight loader converts synchronous exceptions to rejected promises", async () => {
  await assert.rejects(sharedServerLoad("sync-throw", () => { throw new Error("temporary"); }), /temporary/);
  assert.equal(await sharedServerLoad("sync-throw", async () => "ok"), "ok");
});

test("report-only CSP hashes the exact shared scripts and limits X script/frame/connect origins", async () => {
  const headers = (await nextConfig.headers())[0].headers;
  assert.equal(headers.some((header) => header.key === "Content-Security-Policy"), false);
  const policy = headers.find((header) => header.key === "Content-Security-Policy-Report-Only").value;
  for (const script of [THEME_SCRIPT, TEXT_SCRIPT]) {
    assert.ok(policy.includes("'sha256-" + createHash("sha256").update(script).digest("base64") + "'"));
  }
  for (const directive of ["script-src", "frame-src", "connect-src"]) {
    const value = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith(directive + " "));
    assert.ok(value.includes("https://platform.twitter.com"));
    assert.equal(value.includes("*"), false);
    assert.equal(value.includes("'unsafe-inline'"), false);
  }
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.ok(layout.includes('import { THEME_SCRIPT, TEXT_SCRIPT } from "@/lib/prepaint"'));
});
