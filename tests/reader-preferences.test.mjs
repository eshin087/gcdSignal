import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-ts.mjs";
const { DEFAULT_PREFS, parsePrefs } = load("../lib/use-prefs.ts");
const { parseXLink } = load("../lib/x-links.ts");

test("new readers get Broad, All AI and Brief, with raw advanced feeds hidden", () => {
  assert.equal(DEFAULT_PREFS.contentMode, "broad");
  assert.equal(DEFAULT_PREFS.category, "trending");
  assert.equal(DEFAULT_PREFS.view, "brief");
  assert.ok(DEFAULT_PREFS.hidden.includes("top10"));
  assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
});
test("legacy defaults migrate once without losing custom feeds, mutes, display or interests", () => {
  const old = { v: 6, contentMode: "builder", view: "deck", category: "research", followedTopics: ["research"], mutedAuthors: ["reddit:reader"], hidden: ["youtube"],
    custom: [{ id: "custom:123", source: "rss", label: "My feed", params: { url: "https://example.com/rss" } }], textScale: "lg", density: "compact" };
  const next = parsePrefs(JSON.stringify(old));
  assert.equal(next.v, 7); assert.equal(next.contentMode, "broad"); assert.equal(next.view, "brief");
  for (const key of ["category", "followedTopics", "mutedAuthors", "custom", "textScale", "density"]) assert.deepEqual(next[key], old[key]);
  assert.deepEqual(next.hidden, ["youtube", "top10"]);
  const optedIn = parsePrefs(JSON.stringify({ ...next, contentMode: "builder", view: "deck" }));
  assert.equal(optedIn.contentMode, "builder"); assert.equal(optedIn.view, "deck");
});
test("invalid preference payloads fall back safely", () => {
  for (const raw of ["null", "[]", "{", '{"v":99}', '{"v":0}']) assert.deepEqual(parsePrefs(raw), DEFAULT_PREFS);
  assert.equal(parsePrefs('{"v":7,"category":"__proto__","view":"foryou","contentMode":"invalid"}').category, "trending");
});
test("X panel only accepts public-profile/list/post identifiers and strips tracking", () => {
  assert.deepEqual(parseXLink("https://x.com/OpenAI/status/123?s=20"), { url: "https://x.com/OpenAI/status/123", kind: "post", postId: "123" });
  assert.equal(parseXLink("https://twitter.com/OpenAI").url, "https://x.com/OpenAI");
  assert.equal(parseXLink("https://x.com/i/lists/123").kind, "list");
  assert.equal(parseXLink("https://x.com/reader/lists/ai-news").kind, "list");
  for (const url of ["http://x.com/OpenAI", "javascript:alert(1)", "https://x.com.evil.example/OpenAI", "https://x.com@evil.example/OpenAI", "https://user:pass@x.com/OpenAI", "https://x.com:444/OpenAI", "https://x.com/home", "https://x.com/search?q=AI", "https://x.com/i/lists/not-a-number", "<script src='x'>"]) assert.equal(parseXLink(url), null, url);
});
