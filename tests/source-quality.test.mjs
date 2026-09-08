import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { load } from "./load-ts.mjs";
const require = createRequire(import.meta.url);
const Module = require("node:module");
const originalLoad = Module._load;
let xml = "";
Module._load = function (request, parent, isMain) {
  if (parent?.filename.endsWith("rss.ts") && request === "../rss-fetch") {
    const read = async () => ({ xml, fetchedAt: new Date().toISOString() });
    return { readRssDocument: read, readCachedRssDocument: read };
  }
  return originalLoad.call(this, request, parent, isMain);
};
let fetchRss, normalizeRssAuthor;
try { ({ fetchRss, normalizeRssAuthor } = load("../lib/sources/rss.ts")); } finally { Module._load = originalLoad; }
const { fetchYouTube } = load("../lib/sources/youtube.ts");
const { sourceHealth } = load("../lib/source-health.ts");
const timestamp = (hours = 0) => new Date(Date.now() - hours * 3600_000).toISOString();
const rssItem = (title, id, date) => `<item><title>${title}</title><link>https://example.com/${id}</link><guid>${id}</guid><pubDate>${date}</pubDate><description>AI news coverage</description></item>`;
const rssFeed = (items) => `<rss version="2.0"><channel><title>Example</title>${items.join("")}</channel></rss>`;

test("structured Google-style RSS creators normalize to usable author strings", async () => {
  assert.equal(normalizeRssAuthor({ name: ["Four Flynn"], title: ["Vice President"], $: { xmlns: "ignored" } }), "Four Flynn");
  assert.equal(normalizeRssAuthor({ _: "Atom text" }), "Atom text");
  assert.equal(normalizeRssAuthor({ _text: "Other XML text" }), "Other XML text");
  assert.equal(normalizeRssAuthor({ name: 42 }), undefined);
  assert.equal(normalizeRssAuthor({ name: { name: { name: { name: "too deep" } } } }), undefined);
  xml = rssFeed([rssItem("AI security announcement", "google-style", timestamp()).replace("</item>",
    '<author xmlns:author="http://www.w3.org/2005/Atom"><name>Four Flynn</name><title>Vice President</title></author></item>')]);
  const items = await fetchRss({ url: "https://example.com/feed", keywords: [] });
  assert.equal(items.length, 1);
  assert.equal(items[0].author, "Four Flynn");
  assert.equal(sourceHealth(items, "rss").degraded, false);
});

test("RSS topic matching precedes each publisher's eight-item cap", async () => {
  xml = rssFeed([
    ...Array.from({ length: 8 }, (_, i) => rssItem("AI industry announcement " + i, "general-" + i, timestamp(i))),
    rssItem("AI security vulnerability patched", "security", timestamp(9)),
  ]);
  const items = await fetchRss({ url: "https://example.com/feed", keywords: ["security"] });
  assert.deepEqual(items.map((item) => item.title), ["AI security vulnerability patched"]);
});

test("invalid RSS item dates are skipped without failing their publisher", async () => {
  xml = rssFeed([
    rssItem("AI security invalid date", "bad", "not-a-date"),
    rssItem("AI security valid report", "good", timestamp()),
  ]);
  const items = await fetchRss({ url: "https://example.com/feed", keywords: ["security"] });
  assert.deepEqual(items.map((item) => item.title), ["AI security valid report"]);
  assert.equal(sourceHealth(items, "rss").degraded, false);
});

test("invalid Atom published and updated dates do not throw away valid entries", async () => {
  xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Example</title>
    <entry><title>AI security bad published</title><id>bad1</id><link href="https://example.com/bad1"/><published>invalid</published></entry>
    <entry><title>AI security bad updated</title><id>bad2</id><link href="https://example.com/bad2"/><updated>invalid</updated></entry>
    <entry><title>AI security valid Atom report</title><id>good</id><link href="https://example.com/good"/><published>${timestamp()}</published></entry>
    </feed>`;
  const items = await fetchRss({ url: "https://example.com/feed", keywords: ["security"] });
  assert.deepEqual(items.map((item) => item.title), ["AI security valid Atom report"]);
  assert.equal(sourceHealth(items, "rss").degraded, false);
});

test("YouTube keyed category results never expand to unrelated AI when sparse", async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.YOUTUBE_API_KEY;
  process.env.YOUTUBE_API_KEY = "test-only";
  globalThis.fetch = async (value) => {
    const url = String(value);
    const payload = url.includes("/search?") ? { items: [{ id: { videoId: "one" } }, { id: { videoId: "two" } }] }
      : { items: [
        { id: "one", snippet: { title: "AI security vulnerability analysis", publishedAt: timestamp() }, contentDetails: { duration: "PT5M" }, statistics: { viewCount: "20" } },
        { id: "two", snippet: { title: "AI image generator launch", publishedAt: timestamp() }, contentDetails: { duration: "PT5M" }, statistics: { viewCount: "1000" } },
      ] };
    return new Response(JSON.stringify(payload));
  };
  try {
    const items = await fetchYouTube({ q: "AI security", keywords: ["security"] });
    assert.deepEqual(items.map((item) => item.title), ["AI security vulnerability analysis"]);
    const empty = await fetchYouTube({ q: "AI robotics", keywords: ["robotics"] });
    assert.deepEqual(empty, []);
    assert.equal(sourceHealth(empty, "youtube").degraded, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = originalKey;
  }
});

test("YouTube channel RSS keeps selected topics sparse but preserves explicit custom channels", async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.YOUTUBE_API_KEY;
  delete process.env.YOUTUBE_API_KEY;
  globalThis.fetch = async () => new Response(`<feed><title>Example</title>
    <entry><yt:videoId>security</yt:videoId><media:title>AI security tutorial</media:title><published>${timestamp()}</published><media:statistics views="20"/></entry>
    <entry><yt:videoId>general</yt:videoId><media:title>AI art generator</media:title><published>${timestamp()}</published><media:statistics views="1000"/></entry></feed>`);
  try {
    const items = await fetchYouTube({ keywords: ["security"] });
    assert.ok(items.length > 0);
    assert.ok(items.every((item) => item.title === "AI security tutorial"));
    assert.deepEqual(await fetchYouTube({ keywords: ["robotics"] }), []);
    const custom = await fetchYouTube({ channel: "UCexamplechannel", keywords: ["security"] });
    assert.equal(custom.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = originalKey;
  }
});
