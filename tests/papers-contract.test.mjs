import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-ts.mjs";
const { fetchPapers, normalizePaperAuthor } = load("../lib/sources/papers.ts");
const { selectItems, authorKey } = load("../lib/curation.ts");
const { buildTop10 } = load("../lib/brief.ts");
const prefs = { contentMode: "broad", mutedAuthors: [], mutedOutlets: [] };

test("Hugging Face organization objects normalize to bounded author strings", () => {
  assert.equal(normalizePaperAuthor({ name: "example", fullname: "Example Research Lab" }, "Ada"), "Example Research Lab");
  assert.equal(normalizePaperAuthor({ name: "example" }, "Ada"), "example");
  assert.equal(normalizePaperAuthor("Legacy Lab", "Ada"), "Legacy Lab");
  assert.equal(normalizePaperAuthor({ name: 42, fullname: {} }, "Ada"), "Ada");
  assert.equal(normalizePaperAuthor(null, null), undefined);
  assert.equal(normalizePaperAuthor({ fullname: "x".repeat(300) }, null).length, 120);
});

test("full unfiltered paper pool can pass selection before the brief's 72h age filter", async () => {
  const now = Date.now();
  const old = new Date(now - 96 * 3600_000).toISOString();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes("huggingface.co/api/daily_papers")
    ? new Response(JSON.stringify([{ paper: { id: "2609.04199", title: "AI inference benchmark research", organization: { name: "example", fullname: "Example Lab" }, authors: [{ name: "Ada" }], summary: "AI research results" }, publishedAt: old }]))
    : new Response('<feed xmlns="http://www.w3.org/2005/Atom"><title>arXiv</title></feed>');
  try {
    const papers = await fetchPapers({ keywords: [] });
    assert.equal(papers.length, 1);
    assert.equal(papers[0].author, "Example Lab");
    const news = { id: "rss:release", source: "rss", title: "OpenAI releases a new GPT model", url: "https://openai.com/news/new-model", timestamp: new Date(now).toISOString() };
    const pool = [...papers, news];
    const selected = selectItems(pool, prefs, "trending");
    assert.equal(selected.length, 2, "selection still sees the older paper");
    const stories = buildTop10(selected, now, 24);
    assert.ok(stories.some((story) => story.url === news.url));
    assert.ok(stories.every((story) => story.members.every((item) => item.id !== papers[0].id)));
    // Existing browser/CDN payloads can retain the old broken author shape.
    const legacy = { ...papers[0], author: { name: "legacy" } };
    assert.equal(authorKey(legacy), "");
    assert.doesNotThrow(() => buildTop10(selectItems([legacy, news], prefs, "trending"), now, 24));
  } finally { globalThis.fetch = originalFetch; }
});
