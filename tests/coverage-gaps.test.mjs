// Coverage regressions found by the 2026-11-08 live audit: stories the site
// never requested, mislabeled, or dated out of its own recency windows.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { load } from "./load-ts.mjs";

const require = createRequire(import.meta.url);
const Module = require("node:module");
const originalLoad = Module._load;
const documents = new Map();
Module._load = function (request, parent, isMain) {
  if (parent?.filename.endsWith("rss.ts") && request === "../rss-fetch") {
    const read = async (url) => {
      if (!documents.has(url)) throw new Error("Feed publisher unavailable");
      return { xml: documents.get(url), fetchedAt: new Date().toISOString() };
    };
    return { readRssDocument: read, readCachedRssDocument: read };
  }
  return originalLoad.call(this, request, parent, isMain);
};
let rss;
try { rss = load("../lib/sources/rss.ts"); } finally { Module._load = originalLoad; }
const { fetchHackerNews, mapHackerNewsHits, mergeHackerNews, POPULAR_MIN_POINTS } = load("../lib/sources/hackernews.ts");
const { fetchReddit, mapRedditAtom, redditOutboundLink, REDDIT_FEED_NOTICE } = load("../lib/sources/reddit.ts");
const { fetchPapers, paperTimestamp } = load("../lib/sources/papers.ts");
const { classify, isPaper, isPrimarySource, selectItems } = load("../lib/curation.ts");
const { applyRelevance } = load("../lib/relevance.ts");
const { resolveParams } = load("../lib/categories.ts");
const { reportingPublisher, discussionPlatform, relatedTopic } = load("../lib/stories.ts");
const { engagementPercentiles } = load("../lib/sort.ts");
const { buildTop10 } = load("../lib/brief.ts");
const { trendingFloor } = load("../lib/recency.ts");
const { sourceHealth } = load("../lib/source-health.ts");

const HOUR = 3600_000;
const now = Date.parse("2026-11-09T02:00:00Z");
const item = (id, title, extra = {}) => ({
  id, title, source: "rss", url: "https://news.example/" + id,
  timestamp: new Date(now - HOUR).toISOString(), ...extra,
});
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const withFetch = async (handler, run) => {
  const original = globalThis.fetch;
  globalThis.fetch = async (value) => handler(String(value));
  try { return await run(); } finally { globalThis.fetch = original; }
};
const broad = { contentMode: "broad", mutedAuthors: [], mutedOutlets: [] };

/* ---------------- Hacker News candidate pool ---------------- */

const hit = (id, title, points, extra = {}) => ({
  objectID: id, title, points, num_comments: 3, author: "someone",
  url: "https://example.com/" + id, created_at_i: Math.floor(Date.now() / 1000) - 3600, ...extra,
});

test("Hacker News rows without an id, title or date are skipped, not thrown", () => {
  const rows = [hit("1", "OpenAI ships a model", 50), null, { objectID: "2" }, hit("3", "", 9),
    { ...hit("4", "No date", 9), created_at_i: "soon" }, { ...hit("5", "Text post", 7), url: null }];
  assert.deepEqual(mapHackerNewsHits(rows).map((it) => it.id), ["hn:1", "hn:5"]);
  assert.equal(mapHackerNewsHits(rows)[1].externalUrl, undefined);
  assert.deepEqual(mapHackerNewsHits({ message: "upstream failed" }), []);
});

test("merged Hacker News requests keep one row per story, most points first", () => {
  const older = mapHackerNewsHits([hit("1", "A", 600), hit("2", "B", 90)]);
  const newer = mapHackerNewsHits([hit("1", "A", 607), hit("3", "C", 90, { created_at_i: Math.floor(Date.now() / 1000) - 60 })]);
  const merged = mergeHackerNews([older, newer]);
  assert.deepEqual(merged.map((it) => it.id), ["hn:1", "hn:3", "hn:2"]);
  assert.equal(merged[0].score, 607);
});

test("built-in columns request popular stories and the front page instead of one keyword", async () => {
  const urls = [];
  const items = await withFetch((url) => {
    urls.push(url);
    if (url.includes("tags=front_page")) return json({ hits: [hit("3", "A weekend project", 12), hit("1", "Goldman Sachs is pulling Claude Code from its bankers and traders", 607)] });
    return json({ hits: [hit("1", "Goldman Sachs is pulling Claude Code from its bankers and traders", 600), hit("2", "Airbus unveils new aircraft", 900)] });
  }, () => fetchHackerNews({}));
  assert.equal(urls.length, 2);
  assert.ok(urls.every((url) => !url.includes("query=")), "no keyword decides the candidate pool");
  assert.ok(urls.some((url) => url.includes("search_by_date") && url.includes(`points>=${POPULAR_MIN_POINTS}`)));
  assert.deepEqual(items.map((it) => it.id), ["hn:2", "hn:1", "hn:3"]);
  assert.equal(sourceHealth(items, "hackernews").degraded, false);
  // The headline has no standalone "AI": the old title search never asked for it.
  assert.deepEqual(applyRelevance("hackernews", items).map((it) => it.id), ["hn:1"]);
});

test("a topic column adds its keyword search and a custom query keeps its own scope", async () => {
  const urls = [];
  const handler = (url) => { urls.push(url); return json({ hits: [hit("9", "AI security scanner", 2)] }); };
  await withFetch(handler, () => fetchHackerNews({ topic: "AI security" }));
  assert.equal(urls.length, 3);
  assert.equal(urls.filter((url) => url.includes("query=%22AI%22%20security")).length, 1);
  urls.length = 0;
  const custom = await withFetch(handler, () => fetchHackerNews({ q: "rust" }));
  assert.equal(urls.length, 1);
  assert.ok(urls[0].includes("query=rust") && !urls[0].includes("front_page"));
  assert.equal(custom.length, 1);
  assert.deepEqual(resolveParams("hackernews", "trending", new URLSearchParams()), { q: "", topic: "" });
  assert.deepEqual(resolveParams("hackernews", "security", new URLSearchParams()), { q: "", topic: "AI security" });
  assert.deepEqual(resolveParams("hackernews", "security", new URLSearchParams({ q: "rust" })), { q: "rust", topic: "" });
});

test("one failed Hacker News request leaves partial coverage; all failing is an error", async () => {
  const partial = await withFetch((url) => url.includes("front_page") ? json({}, 500) : json({ hits: [hit("1", "OpenAI story", 80)] }),
    () => fetchHackerNews({}));
  assert.equal(partial.length, 1);
  const health = sourceHealth(partial, "hackernews");
  assert.equal(health.degraded, true);
  assert.equal(health.details.find((detail) => detail.id === "Hacker News front page").status, "error");
  await assert.rejects(withFetch(() => json({}, 503), () => fetchHackerNews({})));
});

/* ---------------- Classification ---------------- */

test("an unmatched headline from a recognized news publisher is News, not Commentary", () => {
  const verge = item("siri", "Apple is racing to make Siri more agentic", { url: "https://www.theverge.com/news/1029500/apple-siri-agentic" });
  const label = classify(verge);
  assert.equal(label.kind, "News");
  assert.equal(label.substantive, true);
  assert.ok(label.reasons.includes("Reported by a recognized news publisher"));
  assert.equal(buildTop10([{ ...verge, curation: label }], now).length, 1);
  // The same words on an unrecognized site keep the old fallback.
  assert.equal(classify({ ...verge, url: "https://blog.example/apple-siri" }).kind, "Commentary");
  // A discussion post that links the publisher counts the same way.
  const linked = item("hn", "The US let Nvidia sell chips to an empty office in China", { source: "hackernews", url: "https://news.ycombinator.com/item?id=1", externalUrl: "https://www.reuters.com/technology/chips-2026-11-07/" });
  assert.equal(classify(linked).kind, "News");
});

test("opinion, review, first-person, question and list headlines stay Commentary", () => {
  const stays = [
    ["I Used NYT Cooking’s New AI-Powered Recipe Modifier, and It’s Actually Pretty Good", "https://www.wired.com/story/nyt-cooking-ai/"],
    ["NYT Cooking’s AI assistant saved my weeknight chicken, but almost ruined my cake", "https://www.theverge.com/tech/1/nyt-cooking"],
    ["Could potential AI clones of GTA VI force a quicker official port?", "https://arstechnica.com/gaming/2026/11/gta-clones/"],
    ["The best AI laptops of 2026", "https://www.zdnet.com/article/best-ai-laptops/"],
    ["7 ways to use ChatGPT at work", "https://www.techradar.com/computing/seven-ways"],
    ["AI will not rescue the economy", "https://www.theguardian.com/commentisfree/2026/nov/08/ai-economy"],
    ["Opinion: chatbots are overrated", "https://www.washingtonpost.com/technology/2026/11/08/chatbots/"],
    ["1-0 to humankind? Voters put the chatbot makers back in their box", "https://www.theguardian.com/business/2026/nov/08/voters-chatbots"],
    ["Chatbot makers have been put back in their box | Heather Stewart", "https://www.theguardian.com/business/2026/nov/08/chatbot-makers"],
    ["Tom Gauld on writing with a chatbot – cartoon", "https://www.theguardian.com/books/picture/2026/nov/08/tom-gauld"],
  ];
  for (const [title, url] of stays) assert.equal(classify(item("x", title, { url })).kind, "Commentary", title);
  // "A.I." and "I/O" are not the first person.
  assert.equal(classify(item("nyt", "A.I. Start-Up Rethinks Its Chip Supply", { url: "https://www.nytimes.com/2026/11/08/technology/chip-supply.html" })).kind, "News");
  assert.equal(classify(item("io", "Google I/O keynote moves to the fall", { url: "https://www.theverge.com/tech/2/google-io" })).kind, "News");
  // Quoted speech is the subject's voice, not a first-person article.
  assert.equal(classify(item("quote", "President says chip chief is a “fine person” and “I haven't heard he's done anything wrong”", { url: "https://www.bloomberg.com/news/articles/2026-11-08/chip-chief" })).kind, "News");
});

test("a technical article that is news by default stays in the Builder filter", () => {
  const story = item("latency", "Chip startup cuts model latency in half", { url: "https://www.theregister.com/2026/11/08/latency_startup/" });
  const label = classify(story);
  assert.equal(label.kind, "News");
  assert.equal(label.builder, true);
  assert.equal(selectItems([story], { ...broad, contentMode: "builder" }, "trending").length, 1);
  assert.equal(classify(item("plain", "Chatbot maker opens a second office", { url: "https://www.theregister.com/2026/11/08/office/" })).builder, false);
});

test("a lab headline that leads with a versioned product name is a Release", () => {
  const lab = (id, title, host = "deepmind.google") => item(id, title, { url: `https://${host}/blog/${id}/` });
  for (const title of ["Gemini 4 Carbon: Our next frontier model", "Genie 4: A new generation of world simulation", "Gemini Omni 1.2 Flash: Fast and cost-effective with longer clips", "GPT-6"]) {
    const label = classify(lab("model", title));
    assert.equal(label.kind, "Release", title);
    assert.equal(label.substantive && label.primary, true, title);
  }
  assert.equal(classify(lab("planning", "Speeding up planning decisions with AI")).substantive, false);
  assert.notEqual(classify(lab("tips", "Top 5 AI tips for teachers", "blog.google")).kind, "Release");
  assert.notEqual(classify(lab("fan", "Gemini 4 Carbon: Our next frontier model", "fan-blog.example")).kind, "Release");
});

test("security incidents and corporate actions are recognized from the headline", () => {
  const leak = item("leak", "Claude Code's \"Don't Ask Again\" exposes passwords in 1,122 public GitHub files", { source: "hackernews", url: "https://news.ycombinator.com/item?id=2", externalUrl: "https://apiiro.example/blog/dont-ask-again" });
  assert.equal(classify(leak).kind, "Security");
  for (const title of ["Nvidia Board of Directors Is Investigating Jensen Huang", "Goldman Sachs is pulling Claude Code from its bankers and traders", "OpenAI appoints a chief corporate affairs officer"]) {
    const label = classify(item("corp", title, { source: "hackernews", url: "https://news.ycombinator.com/item?id=3", externalUrl: "https://unknown-site.example/story" }));
    assert.equal(label.kind, "News", title);
    assert.equal(label.substantive, true, title);
  }
});

test("a post that links straight to arXiv is research and follows the paper limits", () => {
  const titles = ["Memorilla: latent semantic memory for agents", "Sparse attention at planetary scale", "A theorem about tokenizer drift", "Diffusion priors for dexterous hands"];
  const link = (i) => item("hn" + i, titles[i], { source: "hackernews", url: "https://news.ycombinator.com/item?id=10" + i, externalUrl: "https://arxiv.org/abs/2611.0123" + i, score: 100 + i });
  assert.equal(classify(link(1)).kind, "Research");
  assert.ok(classify(link(1)).topics.includes("research"));
  assert.equal(isPaper(link(1)), true);
  assert.equal(isPaper(item("n", "OpenAI funding agreement")), false);
  const news = Array.from({ length: 9 }, (_, i) => item("news" + i, "Company" + i + " announces AI funding agreement", { url: "https://outlet" + i + ".example/news" }));
  const stories = buildTop10([...Array.from({ length: 4 }, (_, i) => link(i)), ...news], now);
  assert.equal(stories.length, 10);
  assert.equal(stories.filter((story) => story.members.every(isPaper)).length, 2);
});

test("a stranger's Hugging Face repository is not a primary announcement", () => {
  const post = (path) => item("hf", "GPT-5.5 dataset across my used 25 billion tokens!", { source: "reddit", url: "https://www.reddit.com/r/LocalLLaMA/comments/x/t/", externalUrl: "https://huggingface.co" + path });
  assert.equal(isPrimarySource(post("/datasets/someone/tool-use-trajectories")), false);
  assert.equal(isPrimarySource(post("/someone/some-model")), false);
  assert.equal(isPrimarySource(post("/blog/allenai/toyblocks")), true);
  assert.equal(isPrimarySource(post("/papers/2611.01234")), true);
  // It is not a reporting publisher either, so the post cannot enter the Brief alone.
  assert.equal(reportingPublisher(post("/datasets/someone/tool-use-trajectories")), null);
  assert.equal(reportingPublisher(post("/blog/allenai/toyblocks")), "huggingface.co");
  assert.equal(buildTop10([post("/datasets/someone/tool-use-trajectories")], now).length, 0);
  assert.equal(isPrimarySource(item("lab", "Introducing Project Vela", { url: "https://openai.com/index/project-vela/" })), true);
});

test("one developing topic takes at most two Brief places while other stories wait", () => {
  const angles = [
    ["Nvidia Board of Directors Is Investigating Jensen Huang", "https://nvidianews.example/statement"],
    ["Nvidia CEO Jensen Huang's letter to staff about affair", "https://www.axios.com/2026/11/08/letter"],
    ["Nvidia Opens Investigation Into Jensen Huang’s Relationship With Chinese Spy", "https://www.nytimes.com/2026/11/08/technology/nvidia.html"],
    ["Nvidia opens investigation after report CEO Jensen Huang was target of foreign intelligence", "https://www.theguardian.com/us-news/2026/nov/08/nvidia"],
    ["Email to staff: Jensen Huang admits an affair and says he fell short of his duties to Nvidia's board", "https://www.axios.com/2026/11/08/email"],
  ].map(([title, url], i) => item("nv" + i, title, { url, timestamp: new Date(now - (i + 1) * 600_000).toISOString() }));
  assert.equal(relatedTopic(angles[0].title, angles[1].title), true);
  assert.equal(relatedTopic("OpenAI releases GPT-6 mini", "OpenAI cuts GPT-6 pricing"), false, "a shared company and model alone is not one topic");
  const others = Array.from({ length: 9 }, (_, i) => item("other" + i, "Company" + i + " announces AI funding agreement", { url: "https://outlet" + i + ".example/news", timestamp: new Date(now - 5 * HOUR).toISOString() }));
  const stories = buildTop10([...angles, ...others], now);
  assert.equal(stories.length, 10);
  assert.equal(stories.filter((story) => /Huang/.test(story.title)).length, 2);
  // With nothing else to show, the remaining angles are not hidden.
  assert.equal(buildTop10(angles, now).length, 5);
});

/* ---------------- Relevance word list ---------------- */

test("robotics, Nvidia and a bare Claude are AI; namesakes and graphics cards are not", () => {
  const pool = [
    item("robot", "I watched a humanoid robot clean my apartment"),
    item("nvidia", "Nvidia Board of Directors Is Investigating Jensen Huang"),
    item("claude", "Goodbye Claude, hello Pi"),
    item("monet", "Claude Monet exhibition opens"),
    item("shannon", "Claude Shannon and the birth of information theory"),
    item("actor", "Jean-Claude Van Damme returns to the screen"),
    item("gpu", "Nvidia GeForce RTX 6090 review"),
    item("driver", "Nvidia publishes new Linux drivers"),
    item("crawler", "A robots.txt parser in 50 lines"),
  ];
  assert.deepEqual(applyRelevance("hackernews", pool).map((it) => it.id), ["robot", "nvidia", "claude"]);
});

/* ---------------- Reddit public feed ---------------- */

const redditBody = (link, text = "") => `<table><tr><td><a href="https://www.reddit.com/r/singularity/comments/a/t/"><img src="https://b.thumbs.redditmedia.com/abc.jpg?s=1&amp;w=140" alt="t"/></a></td><td>${text} submitted by <a href="https://www.reddit.com/user/one"> /u/one </a><br/><span><a href="${link}">[link]</a></span> <span><a href="https://www.reddit.com/r/singularity/comments/a/t/">[comments]</a></span></td></tr></table>`;
const redditEntries = () => [
  { id: "t3_a", title: "OpenAI raises $11B at a $1.25T valuation", link: "https://www.reddit.com/r/singularity/comments/a/openai/", author: "/u/one", isoDate: new Date(now - 2 * HOUR).toISOString(), content: redditBody("https://techcrunch.com/2026/11/06/openai-raises/?utm_source=reddit&amp;ref=1") },
  { id: "t3_b", title: "Benchmark chart for the new open model", link: "https://www.reddit.com/r/LocalLLaMA/comments/b/chart/", author: "/u/two", isoDate: new Date(now - 3 * HOUR).toISOString(), content: redditBody("https://i.redd.it/chart.png") },
  { id: "t3_c", title: "Which local model do you run?", link: "https://www.reddit.com/r/LocalLLaMA/comments/c/which/", author: "/u/three", isoDate: new Date(now - 4 * HOUR).toISOString(), content: redditBody("https://www.reddit.com/r/LocalLLaMA/comments/c/which/", "I run a small LLM on a laptop.") },
];

test("Reddit's own image, video and self-post links are not outside sources", () => {
  assert.equal(redditOutboundLink("https://techcrunch.com/a?x=1&amp;y=2"), "https://techcrunch.com/a?x=1&y=2");
  for (const own of ["https://i.redd.it/x.png", "https://v.redd.it/abc", "https://www.reddit.com/r/a/comments/1/t/", "https://preview.redd.it/x.jpg", "/r/a/comments/1/t/", "javascript:alert(1)", undefined]) {
    assert.equal(redditOutboundLink(own), undefined, String(own));
  }
});

test("the public Reddit feed keeps a link post's article and Reddit's own order", () => {
  const items = mapRedditAtom(redditEntries());
  assert.equal(items[0].externalUrl, "https://techcrunch.com/2026/11/06/openai-raises/?utm_source=reddit&ref=1");
  assert.equal(items[0].thumbnail, "https://b.thumbs.redditmedia.com/abc.jpg?s=1&w=140");
  assert.equal(items[0].sourceMeta, "r/singularity");
  assert.equal(reportingPublisher(items[0]), "techcrunch.com");
  assert.equal(discussionPlatform(items[0]), "reddit");
  assert.deepEqual(items.slice(1).map((it) => it.externalUrl), [undefined, undefined]);
  assert.ok(items[2].excerpt.startsWith("I run a small LLM"));
  // No count is invented; the feed's order still says which post leads.
  assert.ok(items.every((it) => it.score === undefined && it.comments === undefined));
  assert.deepEqual(items.map((it) => it.sourceRank), [1, 0.5, 0]);
  const ranks = engagementPercentiles(items);
  assert.deepEqual(items.map((it) => ranks.get(it)), [1, 0.5, 0]);
  assert.equal(mapRedditAtom(redditEntries().slice(0, 1))[0].sourceRank, undefined);
});

const thing = (id, url) => `<div class=" thing id-t3_${id} link" data-fullname="t3_${id}" data-permalink="/r/OpenAI/comments/${id}/t/" data-url="${url}" data-score="42" data-comments-count="7" data-timestamp="${now - HOUR}" data-author="one" data-subreddit-prefixed="r/OpenAI"><a class="title may-blank" href="${url}">OpenAI model post ${id}</a></div>`;
const escapeXml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const redditAtom = () => `<feed xmlns="http://www.w3.org/2005/Atom"><title>top</title>${redditEntries().map((entry) =>
  `<entry><author><name>${entry.author}</name></author><content type="html">${escapeXml(entry.content)}</content><id>${entry.id}</id><link href="${entry.link}"/><published>${entry.isoDate}</published><updated>${entry.isoDate}</updated><title>${escapeXml(entry.title)}</title></entry>`).join("")}</feed>`;

test("Reddit's scored listing drops media links; the fallback feed says counts are missing", async () => {
  const savedId = process.env.REDDIT_CLIENT_ID;
  delete process.env.REDDIT_CLIENT_ID;
  const urls = [];
  try {
    const scored = await withFetch((url) => { urls.push(url); return new Response(thing("x", "https://i.redd.it/x.png") + thing("y", "https://www.wired.com/story/openai/")); },
      () => fetchReddit({ subs: "singularity+OpenAI" }));
    assert.ok(urls[0].includes("/r/OpenAI+singularity/top/"), "requests Reddit's canonical order directly");
    assert.deepEqual(scored.map((it) => it.externalUrl), [undefined, "https://www.wired.com/story/openai/"]);
    assert.equal(scored[0].score, 42);
    assert.equal(sourceHealth(scored, "reddit").details[0].message, undefined);

    const fallback = await withFetch((url) => url.includes("top.rss") ? new Response(redditAtom())
      : new Response("<html>Please wait for verification</html>"), () => fetchReddit({ subs: "singularity+OpenAI" }));
    assert.equal(fallback.length, 3);
    assert.ok(fallback.some((it) => it.externalUrl?.startsWith("https://techcrunch.com/")));
    const health = sourceHealth(fallback, "reddit");
    assert.equal(health.degraded, false, "the public feed is still coverage");
    assert.equal(health.details[0].status, "ok");
    assert.equal(health.details[0].message, REDDIT_FEED_NOTICE);
  } finally { if (savedId !== undefined) process.env.REDDIT_CLIENT_ID = savedId; }
});

/* ---------------- Papers ---------------- */

test("a featured paper is dated by the day it was featured, unless it resurfaced", () => {
  const at = Date.parse("2026-11-06T12:00:00Z");
  const featured = "2026-11-06T00:00:00.000Z";
  assert.equal(paperTimestamp("2026-11-03T18:00:00.000Z", featured, at), featured);
  assert.equal(paperTimestamp("2026-10-20T18:00:00.000Z", featured, at), "2026-10-20T18:00:00.000Z");
  assert.equal(paperTimestamp("2026-11-03T18:00:00.000Z", undefined, at), "2026-11-03T18:00:00.000Z");
  assert.equal(paperTimestamp("2026-11-03T18:00:00.000Z", "2027-01-01T00:00:00.000Z", at), "2026-11-03T18:00:00.000Z");
  assert.equal(paperTimestamp("2026-11-06T06:00:00.000Z", featured, at), "2026-11-06T06:00:00.000Z", "never earlier than publication");
  assert.equal(paperTimestamp(undefined, featured, at), featured);
  assert.equal(paperTimestamp("not a date", { value: 1 }, at), new Date(at).toISOString());
});

test("a paper featured today reaches the 24-hour Brief although its arXiv date is days old", async () => {
  const today = Date.now();
  const featured = new Date(Math.floor(today / 86400_000) * 86400_000).toISOString();
  const papers = await withFetch((url) => url.includes("huggingface.co/api/daily_papers")
    ? json([{ paper: { id: "2611.04199", title: "A language model evaluation method", summary: "AI research results", upvotes: 40, submittedOnDailyAt: featured }, publishedAt: new Date(today - 60 * HOUR).toISOString() }])
    : new Response('<feed xmlns="http://www.w3.org/2005/Atom"><title>arXiv</title></feed>'), () => fetchPapers({ keywords: [] }));
  assert.equal(papers[0].timestamp, featured);
  const stories = buildTop10(selectItems(papers, broad, "trending"), today, 24);
  assert.equal(stories.length, 1);
});

test("the Papers column keeps its newest batch over a weekend, never beyond a week", () => {
  const friday = Date.parse("2026-11-06T00:00:00Z"); // 74 hours before `now`
  const paper = (id, time) => item(id, "Paper " + id, { source: "papers", timestamp: new Date(time).toISOString() });
  const pool = [paper("fri", friday), paper("fri-arxiv", friday - 6 * HOUR), paper("thu", friday - 24 * HOUR), paper("old", now - 30 * 24 * HOUR)];
  const kept = (source, items) => items.filter((it) => Date.parse(it.timestamp) > trendingFloor(source, items, now)).map((it) => it.id);
  assert.deepEqual(kept("papers", pool), ["fri", "fri-arxiv"]);
  assert.deepEqual(kept("rss", pool), [], "other sources keep the plain 72-hour window");
  assert.equal(trendingFloor("papers", [], now), now - 72 * HOUR);
  assert.deepEqual(kept("papers", [paper("stale", now - 10 * 24 * HOUR)]), []);
  const fresh = [paper("today", now - 2 * HOUR), paper("fri", friday)];
  assert.deepEqual(kept("papers", fresh), ["today"], "a current batch restores the 72-hour window");
});

/* ---------------- News roster ---------------- */

const techmemeItem = (id, title, article, credit, withImage = true) => `<item><title>${escapeXml(title)} (${credit})</title><link>https://www.techmeme.com/261108/p${id}#a261108p${id}</link><description><![CDATA[${withImage ? `<A HREF="${article}"><IMG SRC="http://www.techmeme.com/261108/i${id}.jpg"></A>` : ""}
<P><A HREF="https://www.techmeme.com/261108/p${id}#a261108p${id}" TITLE="Techmeme permalink"><IMG SRC="http://www.techmeme.com/img/pml.png"></A> Kate Sullivan / <A HREF="https://www.bloomberg.com/">Bloomberg</A>:<BR>
<SPAN><B><A HREF="${article}">${title}</A></B></SPAN>&nbsp; &mdash;&nbsp; A short summary of the reported story &hellip; </P>]]></description><pubDate>${new Date().toUTCString()}</pubDate><guid>https://www.techmeme.com/261108/p${id}#a261108p${id}</guid></item>`;
const rssDoc = (items) => `<rss version="2.0"><channel><title>Feed</title>${items.join("")}</channel></rss>`;

test("an aggregator item is credited to the article it links, never to the aggregator", () => {
  const article = "https://www.bloomberg.com/news/articles/2026-11-08/openai-talks";
  const body = (xml) => /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(xml)[1];
  assert.equal(rss.aggregatedArticle(body(techmemeItem(1, "OpenAI is in talks", article, "Kate Sullivan/Bloomberg")), "https://www.techmeme.com/feed.xml"), article);
  assert.equal(rss.aggregatedArticle(body(techmemeItem(2, "OpenAI is in talks", article, "Kate Sullivan/Bloomberg", false)), "https://www.techmeme.com/feed.xml"), article);
  assert.equal(rss.aggregatedArticle('<a href="https://www.techmeme.com/261108/p3">permalink</a> <a href="https://www.bloomberg.com/">Bloomberg</a>', "https://www.techmeme.com/feed.xml"), undefined);
  assert.equal(rss.aggregatedArticle('<a href="javascript:alert(1)">x</a><a href="http://insecure.example/story">y</a>', "https://www.techmeme.com/feed.xml"), undefined);
  assert.deepEqual(rss.splitAggregatedTitle("OpenAI is in talks to raise more (Kate Sullivan/Bloomberg)"), { title: "OpenAI is in talks to raise more", credit: "Kate Sullivan / Bloomberg" });
  assert.deepEqual(rss.splitAggregatedTitle("A headline without a credit"), { title: "A headline without a credit" });
});

test("the curated roster uses live feeds, gates whole-site ones and lists the aggregator last", async () => {
  const feed = (label) => rss.RSS_FEEDS.find((entry) => entry.label === label);
  assert.equal(new Set(rss.RSS_FEEDS.map((entry) => entry.label)).size, rss.RSS_FEEDS.length, "labels identify outlets");
  assert.equal(feed("The Register").url, "https://www.theregister.com/headlines.atom");
  for (const label of ["The Register", "NVIDIA", "Techmeme"]) {
    assert.equal(feed(label).siteWide, true, label);
    assert.ok(feed(label).keywords.includes("nvidia") && feed(label).keywords.includes("claude"), label);
    assert.equal(rss.isSiteWideOutlet(label), true, label);
  }
  for (const label of ["Google Research", "The Guardian AI"]) assert.ok(feed(label), label);
  assert.equal(rss.RSS_FEEDS.at(-1).aggregator, true);
  assert.ok(rss.RSS_FEEDS.every((entry) => entry.url.startsWith("https://")));

  const shared = "https://techcrunch.com/2026/11/06/openai-raises/";
  const date = new Date().toUTCString();
  documents.clear();
  documents.set(feed("TechCrunch AI").url, rssDoc([`<item><title>OpenAI raises $11B at a $1.25T valuation</title><link>${shared}</link><guid>tc1</guid><pubDate>${date}</pubDate><description>AI funding news</description></item>`]));
  documents.set(feed("The Register").url, rssDoc([
    `<item><title>Nvidia board investigates its chief executive</title><link>https://www.theregister.com/2026/11/08/nvidia_board/</link><guid>reg1</guid><pubDate>${date}</pubDate><description>Board statement</description></item>`,
    `<item><title>Nvidia GeForce driver update breaks games</title><link>https://www.theregister.com/2026/11/08/geforce/</link><guid>reg2</guid><pubDate>${date}</pubDate><description>Driver notes</description></item>`,
    `<item><title>Postgres 19 lands with a new planner</title><link>https://www.theregister.com/2026/11/08/postgres/</link><guid>reg3</guid><pubDate>${date}</pubDate><description>Database release</description></item>`,
  ]));
  documents.set(feed("Techmeme").url, rssDoc([
    techmemeItem(1, "OpenAI raises $11B at a $1.25T valuation", shared + "?utm_source=techmeme", "Staff/TechCrunch"),
    techmemeItem(2, "Sources: Anthropic weighs a lower IPO valuation", "https://www.bloomberg.com/news/articles/2026-11-08/anthropic-ipo", "Kate Sullivan/Bloomberg"),
    techmemeItem(3, "A phone maker ships a new handset", "https://www.bloomberg.com/news/articles/2026-11-08/handset", "Kate Sullivan/Bloomberg"),
  ]));
  const items = await rss.fetchRss({ keywords: [], category: "trending" });
  const titles = items.map((it) => it.sourceMeta + ": " + it.title);
  assert.ok(titles.includes("TechCrunch AI: OpenAI raises $11B at a $1.25T valuation"));
  assert.ok(!titles.some((title) => title.startsWith("Techmeme: OpenAI raises")), "the publisher's own item wins the duplicate");
  assert.ok(!titles.some((title) => title.includes("Postgres") || title.includes("handset")), "whole-site feeds are prefiltered before their cap");
  const curated = items.find((it) => it.sourceMeta === "Techmeme");
  assert.equal(curated.title, "Sources: Anthropic weighs a lower IPO valuation");
  assert.equal(curated.externalUrl, "https://www.bloomberg.com/news/articles/2026-11-08/anthropic-ipo");
  assert.ok(curated.url.startsWith("https://www.techmeme.com/"));
  assert.equal(curated.author, "Kate Sullivan / Bloomberg");
  assert.equal(curated.excerpt, "A short summary of the reported story …");
  assert.equal(reportingPublisher(curated), "bloomberg.com");
  // The relevance gate, not the prefilter, makes the final call.
  const gated = applyRelevance("rss", items).map((it) => it.title);
  assert.ok(gated.includes("Nvidia board investigates its chief executive"));
  assert.ok(!gated.includes("Nvidia GeForce driver update breaks games"));
  assert.equal(sourceHealth(items, "rss").details.find((detail) => detail.id === "TechCrunch AI").status, "ok");
});
