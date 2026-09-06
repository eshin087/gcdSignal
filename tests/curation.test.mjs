import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-ts.mjs";
const { classify, selectItems, authorKey, outletKey } = load("../lib/curation.ts");
const { applyRelevance } = load("../lib/relevance.ts");
const { canonicalUrl, groupStories, sameEvent } = load("../lib/stories.ts");
const { engagementPercentiles, rankSignal } = load("../lib/sort.ts");
const { buildTop10 } = load("../lib/brief.ts");
const now = Date.parse("2026-09-06T12:00:00Z");
const item = (id, title, extra = {}) => ({ id, title, source: "rss", url: "https://news.example/" + id, timestamp: new Date(now - 3600000).toISOString(), ...extra });
const prefs = { contentMode: "builder", mutedAuthors: [], mutedOutlets: [] };

test("sparse sources never disable the AI gate; custom feeds retain their scope", () => {
  const input = [item("air", "Airbus unveils new aircraft"), item("ai", "OpenAI releases a new model")];
  assert.deepEqual(applyRelevance("hackernews", input).map((i) => i.id), ["ai"]);
  assert.equal(applyRelevance("hackernews", input.slice(0, 1)).length, 0);
  assert.equal(applyRelevance("hackernews", input, { custom: true }).length, 2);
});
test("Builder, Broad, and topic gates are distinct", () => {
  const tutorial = item("guide", "How to build a RAG pipeline with an LLM");
  const security = item("security", "Prompt injection vulnerability in AI assistants");
  const chatter = item("opinion", "Why I love ChatGPT");
  assert.equal(classify(tutorial).kind, "Tutorial");
  assert.equal(classify(security).kind, "Security");
  assert.equal(classify(chatter).builder, false);
  assert.deepEqual(selectItems([tutorial, security, chatter], prefs, "development").map((i) => i.id), ["guide"]);
  assert.equal(selectItems([tutorial, chatter], { ...prefs, contentMode: "broad" }, "development").length, 2);
  assert.equal(selectItems([chatter], prefs, "security", true).length, 1);
});
test("explicit author and outlet mutes apply even to custom feeds", () => {
  const post = item("post", "OpenAI SDK release", { source: "reddit", author: "Alice", sourceMeta: "r/LocalLLaMA" });
  assert.equal(selectItems([post], { ...prefs, mutedAuthors: [authorKey(post)] }, "trending", true).length, 0);
  assert.equal(selectItems([post], { ...prefs, mutedOutlets: [outletKey(post)] }, "trending").length, 0);
});
test("missing and tied engagement receive neutral equal ranks", () => {
  const pool = [item("a", "a"), item("b", "b"), item("c", "c")];
  assert.deepEqual([...engagementPercentiles(pool).values()], [.5, .5, .5]);
  for (const it of pool) it.score = 0;
  assert.deepEqual([...engagementPercentiles(pool).values()], [.5, .5, .5]);
  pool[2].score = 10;
  const ranks = engagementPercentiles(pool);
  assert.equal(ranks.get(pool[0]), ranks.get(pool[1]));
  assert.equal(ranks.get(pool[2]), 1);
});
test("platform-normalized votes and views are comparable", () => {
  const pool = [item("r1", "a", { source: "reddit", score: 10 }), item("r2", "b", { source: "reddit", score: 20 }), item("y1", "c", { source: "youtube", score: 100000 }), item("y2", "d", { source: "youtube", score: 200000 })];
  const ranks = engagementPercentiles(pool);
  assert.equal(ranks.get(pool[1]), ranks.get(pool[3]));
});
test("canonical URLs strip tracking but preserve article and video IDs", () => {
  assert.equal(canonicalUrl("https://www.example.com/story?id=1&utm_source=x#hi"), "https://example.com/story?id=1");
  assert.notEqual(canonicalUrl("https://example.com/?id=1"), canonicalUrl("https://example.com/?id=2"));
  assert.notEqual(canonicalUrl("https://youtube.com/watch?v=one"), canonicalUrl("https://youtube.com/watch?v=two"));
  assert.equal(canonicalUrl("https://youtu.be/one"), canonicalUrl("https://www.youtube.com/watch?v=one&t=42"));
});
test("same-event headlines group without merging versions or homepages", () => {
  const a = item("a", "OpenAI agents hijacked a German wiki to share sandbox exploits");
  const b = item("b", "Rogue OpenAI agents organized an attack using a German wiki", { url: "https://other.example/wiki" });
  assert.equal(groupStories([a, b]).length, 1);
  assert.equal(sameEvent(item("v1", "Qwen 2.5 coding model release"), item("v2", "Qwen 3.5 coding model release")), false);
  assert.equal(sameEvent(item("a", "Unrelated carbon project", { url: "https://example.com/" }), item("b", "Different forest initiative", { url: "https://example.com/" })), false);
});
test("story grouping does not chain through a bridge headline", () => {
  const a = item("a", "Alpha beta gamma delta epsilon");
  const b = item("b", "Alpha beta gamma theta lambda");
  const c = item("c", "Gamma theta lambda sigma omega");
  assert.equal(sameEvent(a, b), true);
  assert.equal(sameEvent(b, c), true);
  assert.equal(sameEvent(a, c), false);
  assert.equal(groupStories([a, b, c]).length, 2);
});
test("Top 10 is order-independent and counts distinct RSS publishers", () => {
  const a = item("a", "OpenAI SDK adds useful tracing support");
  const b = item("b", a.title, { url: "https://second.example/coverage" });
  const input = [a, b, item("c", "Anthropic funding investment expands operations")];
  assert.deepEqual(buildTop10(input, now), buildTop10([...input].reverse(), now));
  const story = buildTop10(input, now)[0];
  assert.equal(story.members.length, 2);
  assert.equal(story.publishers.length, 2);
  assert.equal(story.sources.length, 1);
});
test("one publisher cannot multiply its coverage contribution", () => {
  const top = buildTop10([item("a", "OpenAI SDK adds tracing support"), item("b", "OpenAI SDK adds tracing support")], now)[0];
  assert.equal(top.publishers.length, 1);
  assert.equal(top.members.length, 2);
});
test("Signal boosts followed topics and freshness, with deterministic ties", () => {
  const a = item("a", "OpenAI SDK tooling"), b = item("b", "AI prompt injection vulnerability");
  assert.equal(rankSignal([a, b], ["security"], now)[0].id, "b");
  assert.deepEqual(rankSignal([a, b], [], now), rankSignal([b, a], [], now));
  const old = item("old", a.title, { timestamp: new Date(now - 72 * 3600000).toISOString() });
  assert.equal(rankSignal([old, a], [], now)[0].id, "a");
});
test("Signal inserts another outlet when one dominates", () => {
  const pool = Array.from({ length: 5 }, (_, i) => item("a" + i, "OpenAI SDK tooling"));
  pool.push(item("z", "OpenAI SDK tooling", { url: "https://other.example/tool" }));
  assert.equal(rankSignal(pool, [], now)[2].id, "z");
});
