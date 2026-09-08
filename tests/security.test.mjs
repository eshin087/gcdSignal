import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { load } from "./load-ts.mjs";

test("custom transport never exceeds four active requests", async () => {
  const original = https.request;
  const pending = [];
  let active = 0, maximum = 0, calls = 0;
  try {
    https.request = (_url, _options, respond) => {
      calls++;
      active++;
      maximum = Math.max(maximum, active);
      const req = new EventEmitter();
      req.end = () => pending.push(() => {
        const res = new EventEmitter();
        res.statusCode = 200;
        res.headers = {};
        res.destroy = () => {};
        respond(res);
        active--;
        res.emit("data", Buffer.from("<rss/>"));
        res.emit("end");
      });
      return req;
    };
    const requests = Array.from({ length: 7 }, (_, index) => safeFeedText(`https://example.com/feed/${index}`));
    await new Promise(setImmediate);
    assert.equal(calls, 4);
    while (calls < 7 || pending.length) {
      pending.shift()?.();
      await new Promise(setImmediate);
    }
    assert.deepEqual(await Promise.all(requests), Array(7).fill("<rss/>"));
    assert.equal(maximum, 4);
  } finally { https.request = original; }
});

test("expired custom fetch budget fails without opening a connection", async () => {
  const original = AbortSignal.timeout;
  AbortSignal.timeout = () => AbortSignal.abort();
  try { await assert.rejects(safeFeedText("https://example.com/feed"), /timed out/); }
  finally { AbortSignal.timeout = original; }
});

test("five-minute server entries expire without a public bypass flag", async () => {
  const original = Date.now;
  let clock = original();
  Date.now = () => clock;
  let calls = 0;
  try {
    const loader = async () => ++calls;
    assert.equal(await sharedServerLoad("expiry-test", loader), 1);
    clock += 299999;
    assert.equal(await sharedServerLoad("expiry-test", loader), 1);
    clock += 1;
    assert.equal(await sharedServerLoad("expiry-test", loader), 2);
  } finally { Date.now = original; }
});
const require = createRequire(import.meta.url);
const dns = require("node:dns");
const https = require("node:https");
const { isPublicAddress, validateFeedUrl, publicLookup, safeFeedText, FEED_MAX_BYTES } = load("../lib/safe-fetch.ts");
const { parseFeedRequest } = load("../lib/feed-request.ts");
const { canonicalKey, sharedServerLoad } = load("../lib/server-cache.ts");
const { readLimitedText } = load("../lib/fetch-helpers.ts");
const { attachHealth, sourceHealth, healthDetail, summarizeHealth } = load("../lib/source-health.ts");

test("custom RSS accepts only credential-free public HTTPS hostnames", () => {
  for (const url of ["http://example.com/feed", "https://u:p@example.com/feed", "https://127.0.0.1/feed",
    "https://[::1]/feed", "https://localhost./feed", "https://service.internal/feed", "https://example.com:444/feed",
    "file:///feed", "https://example.com/" + "a".repeat(2050)]) assert.throws(() => validateFeedUrl(url));
  assert.equal(validateFeedUrl("https://EXAMPLE.com/feed#section").href, "https://example.com/feed");
});

test("public-address guard rejects private, local, mapped, and reserved ranges", () => {
  for (const address of ["0.0.0.0", "10.1.1.1", "127.0.0.1", "100.64.1.1", "169.254.169.254",
    "172.16.1.1", "192.168.1.1", "192.0.2.3", "198.18.1.1", "198.51.100.1", "203.0.113.1",
    "224.0.0.1", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "2001:db8::1", "2002:7f00:1::1"]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const address of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"]) assert.equal(isPublicAddress(address), true);
});

test("socket lookup validates every DNS answer and returns the same validated address", async () => {
  const original = dns.lookup;
  try {
    dns.lookup = (_hostname, options, callback) => {
      assert.equal(options.all, true);
      callback(null, [{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }]);
    };
    await assert.rejects(new Promise((resolve, reject) =>
      publicLookup("example.com", {}, (error, address) => error ? reject(error) : resolve(address))), /not public/);
    dns.lookup = (_hostname, _options, callback) => callback(null, [{ address: "1.1.1.1", family: 4 }]);
    const answer = await new Promise((resolve, reject) =>
      publicLookup("example.com", {}, (error, address, family) => error ? reject(error) : resolve({ address, family })));
    assert.deepEqual(answer, { address: "1.1.1.1", family: 4 });
  } finally { dns.lookup = original; }
});

function mockRequests(responses, calls) {
  return (url, options, respond) => {
    calls.push({ url: url.href, options });
    const req = new EventEmitter();
    req.end = () => queueMicrotask(() => {
      const config = responses[Math.min(calls.length - 1, responses.length - 1)];
      const res = new EventEmitter();
      res.statusCode = config.status ?? 200;
      res.headers = config.headers ?? {};
      let destroyed = false;
      res.destroy = (error) => {
        destroyed = true;
        if (error) queueMicrotask(() => res.emit("error", error));
      };
      respond(res);
      queueMicrotask(() => {
        if (destroyed) return;
        for (const chunk of config.chunks ?? [Buffer.from("<rss/>")]) {
          if (destroyed) return;
          res.emit("data", chunk);
        }
        if (!destroyed) res.emit("end");
      });
    });
    return req;
  };
}

test("custom transport pins lookup, validates redirects, and limits redirect count", async () => {
  const original = https.request;
  const calls = [];
  try {
    https.request = mockRequests([{ status: 302, headers: { location: "https://127.0.0.1/private" } }], calls);
    await assert.rejects(safeFeedText("https://example.com/feed"), /public HTTPS/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.lookup, publicLookup);
    assert.equal(calls[0].options.agent, false);
    assert.equal(calls[0].options.headers["Accept-Encoding"], "identity");
    calls.length = 0;
    https.request = mockRequests([{ status: 302, headers: { location: "/next" } }], calls);
    await assert.rejects(safeFeedText("https://example.com/feed"), /Too many/);
    assert.equal(calls.length, 4);
    calls.length = 0;
    https.request = mockRequests([{ status: 302, headers: { location: "https://feeds.example.com/rss" } }, {}], calls);
    assert.equal(await safeFeedText("https://example.com/feed"), "<rss/>");
    assert.equal(calls[1].options.lookup, publicLookup);
  } finally { https.request = original; }
});

test("custom transport caps chunked bodies and rejects unsupported compression", async () => {
  const original = https.request;
  try {
    https.request = mockRequests([{ chunks: [Buffer.alloc(FEED_MAX_BYTES), Buffer.from("x")] }], []);
    await assert.rejects(safeFeedText("https://example.com/feed"), /2 MB/);
    https.request = mockRequests([{ headers: { "content-encoding": "gzip" } }], []);
    await assert.rejects(safeFeedText("https://example.com/feed"), /encoding/);
    https.request = mockRequests([{ headers: { "content-length": FEED_MAX_BYTES + 1 } }], []);
    await assert.rejects(safeFeedText("https://example.com/feed"), /2 MB/);
  } finally { https.request = original; }
});

test("bounded native-fetch body reader handles chunks rather than trusting headers", async () => {
  await assert.rejects(readLimitedText(new Response("123456"), 5), /too large/);
  assert.equal(await readLimitedText(new Response("12345"), 5), "12345");
});

test("feed query normalization drops bypass parameters and rejects prototype categories", () => {
  const base = parseFeedRequest("rss", new URLSearchParams("category=trending"));
  const bust = parseFeedRequest("rss", new URLSearchParams("fresh=1&anything=1&category=trending"));
  assert.equal(bust.canonicalQuery, base.canonicalQuery);
  assert.equal(bust.custom, false);
  assert.deepEqual(bust.params, base.params);
  assert.throws(() => parseFeedRequest("rss", new URLSearchParams("category=constructor")));
  assert.throws(() => parseFeedRequest("rss", new URLSearchParams("category=trending&category=research")));
  assert.equal(parseFeedRequest("reddit", new URLSearchParams("sub=OpenAI")).canonicalQuery, "category=trending&sub=openai");
});

test("server cache coalesces simultaneous normalized loads and reuses success for five minutes", async () => {
  const key = canonicalKey("security-test", { b: "two", a: "one" });
  assert.equal(key, canonicalKey("security-test", { a: "one", b: "two" }));
  let count = 0;
  let complete;
  const loader = () => { count++; return new Promise((resolve) => { complete = resolve; }); };
  const one = sharedServerLoad(key, loader), two = sharedServerLoad(key, loader);
  await Promise.resolve();
  assert.equal(count, 1);
  complete({ ok: true });
  assert.deepEqual(await one, await two);
  await sharedServerLoad(key, loader);
  assert.equal(count, 1);
});

test("server cache does not store failures and allows recovery", async () => {
  let attempts = 0;
  const loader = async () => { if (++attempts === 1) throw new Error("temporary"); return "recovered"; };
  await assert.rejects(sharedServerLoad("failure-test", loader));
  assert.equal(await sharedServerLoad("failure-test", loader), "recovered");
});

test("publisher health remains truthful for partial failures and stale fallback", () => {
  const items = attachHealth([], [healthDetail("One", "ok"), healthDetail("Two", "error")]);
  const health = sourceHealth(items, "rss");
  assert.equal(health.total, 2);
  assert.equal(health.succeeded, 1);
  assert.equal(health.degraded, true);
  assert.equal(health.details[1].lastSuccessAt, undefined);
  const last = "2026-09-01T00:00:00.000Z";
  const stale = summarizeHealth([healthDetail("One", "stale", last)]);
  assert.equal(stale.succeeded, 0);
  assert.equal(stale.details[0].lastSuccessAt, last);
});
