import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { load } from "./load-ts.mjs";

const require = createRequire(import.meta.url);
const Module = require("node:module");
const originalLoad = Module._load;
let transport = async () => { throw new Error("Unexpected live request in fixture test"); };
let busySource = "";
Module._load = function (request, parent, isMain) {
  const exported = originalLoad.call(this, request, parent, isMain);
  if (parent?.filename.endsWith("x-discovery.ts") && request === "./safe-fetch") {
    return { ...exported, safeFeedText: (url) => transport(url) };
  }
  if (parent?.filename.endsWith("x-discovery.ts") && request === "./server-cache") {
    return { ...exported, sharedServerLoad: (key, ...args) => busySource && key.endsWith(busySource)
      ? Promise.reject(new Error("Feed service is busy")) : exported.sharedServerLoad(key, ...args) };
  }
  return exported;
};
let discovery;
try { discovery = load("../lib/x-discovery.ts"); } finally { Module._load = originalLoad; }
const { normalizeDiscoveredXPost, parseHackerNewsDiscovery, parseLatentSpaceDiscovery, rankXDiscovery, loadXDiscovery } = discovery;

const now = Date.now();
const sharedAt = new Date(now - 3600_000).toISOString();
const hit = (changes = {}) => ({ objectID: "500001", title: "OpenAI releases a new reasoning model",
  url: "https://twitter.com/example/status/1234567890123456789", points: 42, num_comments: 9,
  created_at_i: Math.floor(Date.parse(sharedAt) / 1000), ...changes });
const itemXml = (body, extra = {}) => `<item><title>${extra.title ?? "AI News daily recap"}</title>
  <link>${extra.link ?? "https://www.latent.space/p/example-recap"}</link>
  <pubDate>${extra.date ?? sharedAt}</pubDate><content:encoded><![CDATA[${body}]]></content:encoded></item>`;
const rss = (...items) => `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
  <title>Latent Space</title><link>https://www.latent.space/</link>${items.join("")}</channel></rss>`;
const paragraph = '<p>Anthropic released a new language model, according to <a href="https://x.com/example/status/2234567890123456789">the announcement</a>.</p>';

test("discovered X identities unify hosts, tracking and media links while rejecting other URLs", () => {
  assert.deepEqual(normalizeDiscoveredXPost("http://mobile.twitter.com/Example/status/123?utm_source=hn"), {
    id: "123", author: "Example", url: "https://x.com/Example/status/123",
  });
  assert.equal(normalizeDiscoveredXPost("https://www.x.com/new_handle/status/123/photo/1").id, "123");
  for (const url of ["https://x.com/example", "https://x.com/i/lists/123", "https://x.com.evil.example/a/status/123",
    "https://x.com@evil.example/a/status/123", "https://u:p@x.com/a/status/123", "https://x.com:8080/a/status/123",
    "javascript:alert(1)", "https://x.com/a/status/not-an-id", "https://x.com/a/status/0", "//x.com/a/status/123"])
    assert.equal(normalizeDiscoveredXPost(url), null, url);
});

test("HN discovery admits AI headlines and dated public links, never arbitrary matching URLs or sponsor copy", () => {
  const items = parseHackerNewsDiscovery({ hits: [hit(), hit({ objectID: "500002", title: "Airbus launches an airplane" }),
    hit({ objectID: "500003", title: "Gemini cafe has opened" }), hit({ objectID: "500004", url: "https://example.com/openai" }),
    hit({ objectID: "500005", title: "Sponsored: OpenAI tools to buy" }), hit({ objectID: "500006", created_at_i: NaN }),
    hit({ objectID: "500007", created_at_i: Math.floor(now / 1000) + 3600 }), hit({ objectID: "500008", created_at_i: Math.floor(now / 1000) - 8 * 86400 }),
    hit({ objectID: "bad<script>" }), hit({ objectID: "500009", points: -5, num_comments: Infinity,
      title: "Claude 4 model announcement", url: "https://x.com/example/status/2" })] }, now);
  assert.equal(items.length, 2);
  assert.equal(items[0].mention.sourceUrl, "https://news.ycombinator.com/item?id=500001");
  assert.equal(items[0].mention.points, 42);
  assert.equal(items[1].mention.points, undefined);
  assert.equal(items[1].mention.comments, undefined);
  assert.throws(() => parseHackerNewsDiscovery({ message: "upstream failed" }), /Invalid/);
});

test("RSS discovery uses local paragraph context and preserves attribution instead of newsletter-wide relevance", async () => {
  const xml = rss(itemXml(`<h1>AI News</h1>${paragraph}
    <p>A lovely cafe opened <a href="https://x.com/cafe/status/3">today</a>.</p>
    <p>Sponsored: OpenAI productivity <a href="https://x.com/ad/status/4">offer</a></p>
    <p>OpenAI profile <a href="https://x.com/OpenAI">follow</a></p>
    <p>AI bots <a href="javascript:alert(1)">link</a></p>
    <script><p>AI model <a href="https://x.com/script/status/5">script</a></p></script>`));
  const items = await parseLatentSpaceDiscovery(xml, now);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "2234567890123456789");
  assert.equal(items[0].mention.source, "latent-space");
  assert.equal(items[0].mention.sourceTitle, "AI News daily recap");
  assert.equal(items[0].mention.sharedAt, sharedAt);
  assert.equal(items[0].title.includes("<"), false);
  assert.equal(items[0].mention.points, undefined, "curator inclusion does not fabricate votes");
});

test("RSS skips ambiguous multi-post paragraphs, but repeated links to one post remain one candidate", async () => {
  const items = await parseLatentSpaceDiscovery(rss(itemXml(`
    <p>OpenAI announcements <a href="https://x.com/a/status/1">one</a> and <a href="https://x.com/b/status/2">two</a>.</p>
    <p>OpenAI release <a href="https://x.com/a/status/3">announcement</a> and <a href="https://twitter.com/a/status/3">same link</a>.</p>`)), now);
  assert.deepEqual(items.map((item) => item.id), ["3"]);
});

test("RSS ignores bad publication dates/out-of-scope article URLs and rejects unsafe XML", async () => {
  const xml = rss(itemXml(paragraph, { date: "invalid-date" }), itemXml(paragraph, { date: "2000-01-01" }),
    itemXml(paragraph, { date: new Date(now + 3600_000).toISOString() }),
    itemXml(paragraph, { link: "https://evil.example/p/story" }), itemXml(paragraph, { title: "Sponsored AI issue" }));
  assert.deepEqual(await parseLatentSpaceDiscovery(xml, now), []);
  await assert.rejects(parseLatentSpaceDiscovery('<!DOCTYPE rss [<!ENTITY secret "abc">]><rss/>'), /Unsupported/);
  await assert.rejects(parseLatentSpaceDiscovery("x".repeat(2 * 1024 * 1024 + 1)), /Unsupported/);
  await assert.rejects(parseLatentSpaceDiscovery("<rss><channel>broken"));
});

test("ranking deduplicates post IDs and takes maximum HN metrics rather than adding reposts", async () => {
  const first = parseHackerNewsDiscovery({ hits: [hit()] }, now)[0];
  const duplicate = parseHackerNewsDiscovery({ hits: [hit({ url: "https://x.com/renamed/status/1234567890123456789", points: 70 }),
    hit({ objectID: "500002", points: 30, num_comments: 4 })] }, now);
  const curated = (await parseLatentSpaceDiscovery(rss(itemXml(paragraph.replace("2234567890123456789", first.id))), now))[0];
  const [post] = rankXDiscovery([first, ...duplicate, curated], now);
  assert.equal(post.id, first.id);
  assert.equal(post.mentions.length, 3);
  assert.equal(post.mentions.filter((mention) => mention.sourceUrl.endsWith("500001"))[0].points, 70);
  assert.ok(post.reasons.includes("70 HN points"));
  assert.ok(post.reasons.includes("Linked by two public sources"));
  assert.equal(post.reasons.some((reason) => /viral|verified|likes|trending/i.test(reason)), false);
  const equivalent = rankXDiscovery([{ ...first, mention: { ...first.mention, points: 70 } }, curated], now)[0];
  assert.equal(post.rank, equivalent.rank, "repeated HN submissions do not boost the score");
});

test("ranking favors recent public attention and caps results while retaining vote-free curator picks", async () => {
  const old = parseHackerNewsDiscovery({ hits: [hit({ points: 100, created_at_i: Math.floor(now / 1000) - 6 * 86400 })] }, now)[0];
  const recent = parseHackerNewsDiscovery({ hits: [hit({ points: 100, url: "https://x.com/example/status/2" })] }, now)[0];
  const curated = (await parseLatentSpaceDiscovery(rss(itemXml(paragraph)), now))[0];
  const ranked = rankXDiscovery([old, recent, curated], now);
  assert.equal(ranked[0].id, "2");
  assert.ok(ranked.some((post) => post.id === curated.id));
  const many = Array.from({ length: 100 }, (_, index) => ({ ...recent, id: String(index + 1) }));
  assert.equal(rankXDiscovery(many, now).length, 80);
});

test("ranking keeps a stable representative and limits repeated authors when alternatives exist", () => {
  const better = parseHackerNewsDiscovery({ hits: [hit({ points: 100 })] }, now)[0];
  const worse = parseHackerNewsDiscovery({ hits: [hit({ points: 1, title: "Another AI commentary headline" })] }, now)[0];
  assert.equal(rankXDiscovery([better, worse], now)[0].title, better.title);
  assert.equal(rankXDiscovery([worse, better], now)[0].title, better.title);
  const repeated = Array.from({ length: 5 }, (_, i) => ({ ...better, id: String(i + 1), author: i % 2 ? "EXAMPLE" : "example" }));
  const alternatives = Array.from({ length: 20 }, (_, i) => ({ ...worse, id: String(i + 10), author: `other${i}` }));
  const ranked = rankXDiscovery([...repeated, ...alternatives], now);
  assert.equal(ranked.slice(0, 20).filter((post) => post.author.toLowerCase() === "example").length, 2);
  assert.equal(ranked.length, 25, "deferred authors remain available farther down");
  assert.equal(rankXDiscovery(repeated, now).length, 5, "sparse feeds are not emptied by author diversity");
});

test("loader coalesces fixed sources, preserves partial failures and caches stale fallback for five minutes", async () => {
  const calls = [];
  let mode = "partial";
  transport = async (url) => {
    calls.push(url);
    const parsed = new URL(url);
    if (parsed.hostname === "www.latent.space") {
      if (mode === "failed") throw new Error("publisher unavailable");
      return rss(itemXml(paragraph));
    }
    assert.equal(parsed.hostname, "hn.algolia.com");
    assert.equal(parsed.searchParams.get("hitsPerPage"), "100");
    assert.equal(parsed.searchParams.get("restrictSearchableAttributes"), "url");
    if (mode === "failed" || parsed.searchParams.get("query") === "x.com") throw new Error("unavailable");
    return JSON.stringify({ hits: [hit()] });
  };
  const originalNow = Date.now;
  let clock = now;
  Date.now = () => clock;
  try {
    const [first, concurrent] = await Promise.all([loadXDiscovery(), loadXDiscovery()]);
    assert.equal(calls.length, 3, "one request per fixed contributor despite concurrent views");
    assert.deepEqual(first.items, concurrent.items);
    assert.equal(first.items.length, 2);
    assert.equal(first.health.succeeded, 2);
    assert.equal(first.health.failed, 1);
    assert.equal(first.health.details.find((entry) => entry.id === "hackernews:x.com").status, "error");
    const lastSuccess = first.health.details.find((entry) => entry.id === "latent-space").lastSuccessAt;
    await loadXDiscovery();
    assert.equal(calls.length, 3, "failures are cached too");
    mode = "failed";
    clock += 300_001;
    const stale = await loadXDiscovery();
    assert.equal(calls.length, 6);
    assert.equal(stale.items.length, 2);
    assert.equal(stale.stale, true);
    assert.equal(stale.health.succeeded, 0);
    assert.equal(stale.health.details.find((entry) => entry.id === "latent-space").lastSuccessAt, lastSuccess);
    assert.equal(stale.fetchedAt, first.fetchedAt, "failed refreshes do not relabel last-good data as freshly retrieved");
    assert.equal(stale.health.details.find((entry) => entry.id === "hackernews:x.com").status, "error");
    await loadXDiscovery();
    assert.equal(calls.length, 6, "repeated public refresh does not bypass stale/error cache");
    clock += 24 * 3600_000;
    const expired = await loadXDiscovery();
    assert.equal(expired.items.length, 0);
    assert.equal(expired.health.details.every((entry) => entry.status === "error"), true);
    clock += 300_001;
    mode = "partial";
    busySource = "latent-space";
    const overloaded = await loadXDiscovery();
    assert.equal(overloaded.items.length, 1, "a single cache capacity rejection preserves other sources");
    assert.equal(overloaded.health.succeeded, 1);
    assert.equal(overloaded.health.details.find((entry) => entry.id === "latent-space").status, "error");
  } finally { Date.now = originalNow; busySource = ""; }
});
