import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-ts.mjs";
const { classify, selectItems } = load("../lib/curation.ts");
const { applyRelevance } = load("../lib/relevance.ts");
const { CATEGORIES, isCategoryId } = load("../lib/categories.ts");
const { stableStoryId, sameEvent, reportingPublisher, discussionPlatform } = load("../lib/stories.ts");
const { rankSignal } = load("../lib/sort.ts");
const { buildTop10 } = load("../lib/brief.ts");
const now = Date.parse("2026-09-07T20:00:00Z");
const item = (id, title, extra = {}) => ({
  id, title, source: "rss", url: "https://news.example/" + id,
  timestamp: new Date(now - 3600000).toISOString(), ...extra,
});
const broad = { contentMode: "broad", mutedAuthors: [], mutedOutlets: [] };

test("All AI names the default scope and category validation excludes prototypes", () => {
  assert.equal(CATEGORIES.trending.label, "All AI");
  assert.equal(isCategoryId("toString"), false);
  assert.equal(isCategoryId("__proto__"), false);
});

test("Broad honors selected topics while explicit custom feeds retain their scope", () => {
  const pool = [item("study", "AI-designed drug helps patients", { excerpt: "A study in Nature describes the trial." }), item("release", "OpenAI releases a new model")];
  assert.equal(classify(pool[0]).kind, "Research");
  assert.deepEqual(selectItems(pool, broad, "research").map((it) => it.id), ["study"]);
  assert.equal(selectItems(pool, broad, "research", true).length, 2);
  assert.equal(selectItems(pool, broad, "trending").length, 2);
});

test("Signal no longer applies a hidden Builder boost", () => {
  const ordinary = item("a", "I feel differently about AI today");
  const builder = item("z", "OpenAI SDK release");
  assert.equal(classify(ordinary).builder, false);
  assert.equal(classify(builder).builder, true);
  assert.equal(rankSignal([builder, ordinary], [], now)[0].id, "a");
});

test("ambiguous names and sponsor copy cannot establish AI relevance", () => {
  const pool = [
    item("animal", "Llama population growing in the Andes"),
    item("stars", "Gemini constellation guide"),
    item("art", "Claude Monet exhibition opens"),
    item("movie", "Transformers film gets a sequel"),
    item("sponsor", "A guide to the best cameras", { excerpt: "Photography tips. Thanks to our sponsor OpenAI, an AI model company." }),
    item("real", "Gemini model gains a larger context window"),
  ];
  assert.deepEqual(applyRelevance("hackernews", pool).map((it) => it.id), ["real"]);
});

test("brand-new primary announcements survive even without known model keywords", () => {
  const primary = item("new-name", "Introducing Project Vela", { url: "https://openai.com/index/project-vela/" });
  assert.equal(applyRelevance("rss", [primary]).length, 1);
  assert.equal(classify(primary).primary, true);
  assert.equal(buildTop10([primary], now).length, 1);
});

test("integer, decimal and entity-conflicting releases never merge", () => {
  assert.equal(sameEvent(item("a", "OpenAI releases GPT-5 coding model for developers"), item("b", "OpenAI releases GPT-6 coding model for developers")), false);
  assert.equal(sameEvent(item("a", "Qwen 2.5 coding model release"), item("b", "Qwen 3.5 coding model release")), false);
  assert.equal(sameEvent(item("a", "OpenAI releases low cost developer platform"), item("b", "Anthropic releases low cost developer platform")), false);
});

test("shared article IDs remain stable across platform reposts and tracking", () => {
  const original = item("original", "OpenAI releases GPT-6", { url: "https://www.news.example/story?id=6&utm_source=email#intro" });
  const repost = item("reddit-copy", original.title, { source: "reddit", url: "https://reddit.com/r/ai/comments/one", externalUrl: "https://news.example/story?id=6" });
  assert.equal(stableStoryId(original), stableStoryId(repost));
  assert.notEqual(stableStoryId(original), stableStoryId({ ...original, url: "https://news.example/story?id=5" }));
  assert.equal(reportingPublisher(repost), "news.example");
  assert.equal(discussionPlatform(repost), "reddit");
});

test("evergreen release notes distinguish versions without breaking ordinary repost identity", () => {
  const release = item("notes", "OpenAI releases GPT-5", { url: "https://example.com/release-notes" });
  const next = { ...release, title: "OpenAI releases GPT-6" };
  assert.notEqual(stableStoryId(release), stableStoryId(next));
  assert.equal(sameEvent(release, next), false);
  const repost = { ...release, id: "reddit", source: "reddit", url: "https://reddit.com/r/ai/post", externalUrl: "https://www.example.com/release-notes?utm_source=reddit", title: "OpenAI releases GPT5" };
  assert.equal(stableStoryId(release), stableStoryId(repost));
  assert.equal(stableStoryId({ ...release, url: "https://example.com/article/one" }), stableStoryId({ ...next, url: "https://example.com/article/one" }));
});

test("reposts count as discussion, not independent reporting", () => {
  const original = item("original", "OpenAI SDK adds tracing support");
  const repost = item("repost", original.title, { source: "reddit", externalUrl: original.url, score: 1000 });
  const story = buildTop10([original, repost], now)[0];
  assert.deepEqual(story.publishers, ["news.example"]);
  assert.deepEqual(story.platforms, ["reddit"]);
  assert.equal(story.members.length, 2);
  assert.ok(story.reasons.includes("Discussion on reddit"));
});

test("default Brief uses24h, 72h is explicit, reposts do not reset the clock", () => {
  const original = item("old", "OpenAI releases useful tracing support", { timestamp: new Date(now - 36 * 3600000).toISOString() });
  const repost = item("copy", original.title, { source: "reddit", externalUrl: original.url });
  assert.equal(buildTop10([original], now).length, 0);
  assert.equal(buildTop10([original], now, 72).length, 1);
  assert.equal(buildTop10([original, repost], now).length, 0);
  assert.equal(buildTop10([original, repost], now, 72)[0].firstPublishedAt, original.timestamp);
});

test("primary research needs no votes; popular opinion and paid headlines stay out", () => {
  const paper = item("paper", "A new theorem changes language model evaluation", { source: "papers", url: "https://arxiv.org/abs/2609.01234", score: 0 });
  const opinion = item("opinion", "How I feel about AI", { source: "hackernews", score: 10000 });
  const paid = item("paid", "Sponsored: OpenAI SDK release", { score: 10000 });
  assert.deepEqual(buildTop10([opinion, paid, paper], now).map((story) => story.members[0].id), ["paper"]);
});

test("primary tutorials, commentary and routine tool recommendations stay in Deck", () => {
  const tutorial = item("tutorial", "How to build with our AI SDK", { url: "https://openai.com/index/sdk-guide/" });
  const opinion = item("thoughts", "My thoughts on AI", { url: "https://anthropic.com/news/thoughts/" });
  const tools = item("tools", "Useful AI SDK plugins for your workflow", { url: "https://openai.com/index/plugins/" });
  const discussion = item("discussion", "Observations on model inference throughput", { url: "https://anthropic.com/news/observations/" });
  const securityGuide = item("security-guide", "How to prevent prompt injection", { url: "https://openai.com/index/security-guide/" });
  const announcement = item("launch", "Introducing Project Vela", { url: "https://openai.com/index/project-vela/" });
  const update = item("update", "OpenAI SDK adds tracing support", { url: "https://openai.com/index/sdk-tracing/" });
  assert.equal(classify(tutorial).kind, "Tutorial");
  assert.equal(classify(securityGuide).kind, "Tutorial");
  assert.equal(classify(discussion).kind, "Discussion");
  assert.equal(classify(tools).substantive, false);
  assert.equal(classify(update).kind, "Release");
  assert.deepEqual(new Set(buildTop10([tutorial, securityGuide, opinion, tools, discussion, announcement, update], now).map((story) => story.members[0].id)), new Set(["launch", "update"]));
});

test("a large paper pool cannot crowd substantive news out of the Brief", () => {
  const papers = Array.from({ length: 12 }, (_, i) => item("paper" + i, "Research finding number " + i, { source: "papers", url: "https://arxiv.org/abs/2609." + i }));
  const news = Array.from({ length: 8 }, (_, i) => item("news" + i, "Company" + i + " announces AI funding agreement", { url: "https://outlet" + i + ".example/news", timestamp: new Date(now - 2 * 3600000).toISOString() }));
  const result = buildTop10([...papers, ...news], now);
  assert.equal(result.length, 10);
  assert.equal(result.filter((story) => story.members.every((it) => it.source === "papers")).length, 2);
});
