import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-ts.mjs";
const { cachedFeed, feedUrl, loadFeed } = load("../lib/feed-cache.ts");

test("cache shares requests and supports warm switching, explicit refresh and fallback", async (t) => {
  let calls = 0, release;
  const data = { source: "rss", items: [], fetchedAt: "2026-09-06T12:00:00Z" };
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    await new Promise((resolve) => { release = resolve; });
    return { ok: true, json: async () => data };
  });
  const url = feedUrl("rss", "trending");
  const first = loadFeed(url), second = loadFeed(url);
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await first, await second);
  await loadFeed(url);
  assert.equal(calls, 1);
  let freshUrl;
  t.mock.method(globalThis, "fetch", async (url) => {
    calls++; freshUrl = url;
    return { ok: true, json: async () => data };
  });
  await loadFeed(url, true);
  assert.match(freshUrl, /fresh=1/);
  assert.equal(calls, 2);
  t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  assert.equal((await loadFeed(url, true)).stale, true);
  assert.equal(cachedFeed(url).stale, false, "fallback must not overwrite last-good response");
  await assert.rejects(loadFeed("/api/feeds/unknown"), /offline/);
});
test("cache rejects error-shaped 200 responses", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({ items: [], error: "upstream blocked" }) }));
  await assert.rejects(loadFeed("/api/feeds/blocked"), /upstream blocked/);
  assert.equal(cachedFeed("/api/feeds/blocked"), null);
});
test("cache is bounded and expires stale responses", async (t) => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({ source: "rss", items: [], fetchedAt: new Date(now).toISOString() }) }));
  for (let i = 0; i < 26; i++) await loadFeed("/api/feeds/rss?test=" + i);
  assert.equal(cachedFeed("/api/feeds/rss?test=0"), null);
  assert.ok(cachedFeed("/api/feeds/rss?test=25"));
  now += 61000;
  assert.equal(cachedFeed("/api/feeds/rss?test=25").stale, true);
  now += 24 * 3600000;
  assert.equal(cachedFeed("/api/feeds/rss?test=25"), null);
});
test("cache keys normalize custom params and separate categories", () => {
  assert.equal(feedUrl("reddit", "trending", { b: "2", a: "1" }), feedUrl("reddit", "trending", { a: "1", b: "2" }));
  assert.notEqual(feedUrl("rss", "security"), feedUrl("rss", "research"));
});
