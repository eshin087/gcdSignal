import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { load } from "./load-ts.mjs";
const require = createRequire(import.meta.url);
const Module = require("node:module");
const originalLoad = Module._load;
let loads = 0;
let cacheOptions;
const cacheKeys = [];
const cached = new Map();
Module._load = function (request, parent, isMain) {
  if (parent?.filename.endsWith("rss-fetch.ts") && request === "next/cache") {
    return { unstable_cache: (fn, keys, options) => {
      cacheOptions = options;
      assert.ok(keys.includes("signal-safe-rss-v1"));
      return async (...args) => {
        const key = JSON.stringify(args); cacheKeys.push(key);
        if (!cached.has(key)) cached.set(key, await fn(...args));
        return cached.get(key);
      };
    } };
  }
  if (parent?.filename.endsWith("rss-fetch.ts") && request === "./safe-fetch") {
    return { safeFeedText: async () => { loads++; return "<rss/>"; } };
  }
  return originalLoad.call(this, request, parent, isMain);
};
let rss;
try { rss = load("../lib/rss-fetch.ts"); } finally { Module._load = originalLoad; }

test("curated RSS cache uses the stable URL and preserves original retrieval time", async () => {
  const first = await rss.readCachedRssDocument("https://example.com/feed");
  const second = await rss.readCachedRssDocument("https://example.com/feed");
  assert.deepEqual(second, first);
  assert.equal(loads, 1);
  assert.equal(cacheOptions.revalidate, 300);
  assert.equal(cacheKeys[0], cacheKeys[1]);
  assert.equal(first.xml, "<rss/>");
  assert.ok(Number.isFinite(Date.parse(first.fetchedAt)));
  await rss.readRssDocument("https://custom.example.com/feed");
  assert.equal(loads, 2);
  assert.equal(cacheKeys.length, 2, "custom direct reads do not populate persistent cache");
});

test("persistent RSS stale fallback is rejected after 24 hours", async () => {
  const first = await rss.readCachedRssDocument("https://old.example.com/feed");
  const originalNow = Date.now;
  Date.now = () => Date.parse(first.fetchedAt) + 24 * 3600_000 + 1;
  try { await assert.rejects(rss.readCachedRssDocument("https://old.example.com/feed"), /too old/); }
  finally { Date.now = originalNow; }
});
