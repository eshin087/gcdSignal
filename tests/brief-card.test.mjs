import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-ts.mjs";
const { briefAttribution, briefCard, originLabel } = load("../lib/brief-card.ts");
const { decodeEntities, excerptMarkup, stripHtml } = load("../lib/fetch-helpers.ts");
const excerptText = (html) => stripHtml(excerptMarkup(html));

const at = "2026-11-09T18:00:00Z";
const item = (id, extra = {}) => ({ id, source: "rss", title: "Lab releases a new model", url: "https://news.example/" + id, timestamp: at, ...extra });
const story = (members, extra = {}) => ({ id: "story", title: members[0].title, url: members[0].url, sources: [], timestamp: at, members, ...extra });

test("a shared link with no text borrows a publisher's summary and credits that publisher", () => {
  const shared = item("post", { source: "reddit", url: "https://reddit.com/r/ai/comments/one", externalUrl: "https://lab.example/news/model", sourceMeta: "r/ai", score: 801, comments: 205 });
  const report = item("report", { sourceMeta: "The Outlet", excerpt: " The lab announced two models today. " });
  const thread = item("thread", { source: "hackernews", url: "https://news.ycombinator.com/item?id=1", externalUrl: "https://lab.example/news/model", score: 950, comments: 576 });
  const card = briefCard(story([shared, report, thread], { publishers: ["lab.example", "news.example"], comments: 781 }));
  assert.equal(card.origin, "lab.example");
  assert.deepEqual(card.excerpt, { text: "The lab announced two models today.", credit: "The Outlet" });
  assert.equal(card.publishers, 2);
  assert.deepEqual(card.points, { count: 950, platform: "hackernews" });
  assert.equal(card.comments, 781);
});

test("a publisher's own excerpt stays with its headline", () => {
  const own = item("own", { sourceMeta: "The Outlet", excerpt: "Its own summary." });
  const other = item("other", { sourceMeta: "Another Outlet", excerpt: "A different summary." });
  const card = briefCard(story([own, other], { publishers: ["news.example"] }));
  assert.equal(card.origin, "The Outlet");
  assert.deepEqual(card.excerpt, { text: "Its own summary.", credit: "The Outlet" });
  assert.equal(card.points, undefined);
  assert.equal(card.comments, undefined);
});

test("a poster's remark is a last resort and is credited to where it was posted, not the linked site", () => {
  const shared = item("post", { source: "reddit", url: "https://reddit.com/r/ai/comments/one", externalUrl: "https://lab.example/news/model", sourceMeta: "r/ai", excerpt: "This looks big." });
  const alone = briefCard(story([shared]));
  assert.equal(alone.origin, "lab.example");
  assert.deepEqual(alone.excerpt, { text: "This looks big.", credit: "r/ai" });
  const report = item("report", { sourceMeta: "The Outlet", excerpt: "The publisher's account." });
  assert.equal(briefCard(story([shared, report])).excerpt.credit, "The Outlet");
  // A discussion thread's own text never describes someone else's reporting.
  const thread = item("thread", { source: "hackernews", url: "https://news.ycombinator.com/item?id=1", excerpt: "Ask HN text" });
  assert.equal(briefCard(story([item("bare"), thread])).excerpt, undefined);
});

test("the evidence line names the link's site and the excerpt's author whenever they differ", () => {
  const shared = item("post", { source: "reddit", url: "https://reddit.com/r/ai/comments/one", externalUrl: "https://lab.example/news/model", sourceMeta: "r/ai", excerpt: "This looks big." });
  // The poster's own remark on a shared link: the reader still sees where the headline leads.
  assert.deepEqual(briefAttribution(briefCard(story([shared]))), ["lab.example", "Excerpt · r/ai"]);
  const report = item("report", { sourceMeta: "The Outlet", excerpt: "The publisher's account." });
  assert.deepEqual(briefAttribution(briefCard(story([{ ...shared, excerpt: undefined }, report]))), ["lab.example", "Excerpt · The Outlet"]);
  assert.deepEqual(briefAttribution(briefCard(story([report]))), ["Excerpt · The Outlet"]);
  assert.deepEqual(briefAttribution(briefCard(story([item("bare", { sourceMeta: "The Outlet" })]))), ["Via · The Outlet"]);
});

test("only comparable vote totals are shown, and views are never called points", () => {
  const video = item("video", { source: "youtube", url: "https://youtube.com/watch?v=abc", score: 640000 });
  const unscored = item("post", { source: "reddit", url: "https://reddit.com/r/ai/comments/one", sourceMeta: "r/ai" });
  const card = briefCard(story([item("report"), video, unscored]));
  assert.equal(card.points, undefined);
  assert.equal(briefCard({ ...story([item("report")]), members: [] }), null);
});

test("origin names a publisher's feed, else the linked site, else the community", () => {
  assert.equal(originLabel(item("a", { sourceMeta: "The Outlet" })), "The Outlet");
  assert.equal(originLabel(item("b")), "news.example");
  assert.equal(originLabel(item("c", { source: "reddit", url: "https://reddit.com/r/ai/comments/one", sourceMeta: "r/ai" })), "r/ai");
});

test("excerpt text drops image captions and link-only list items but keeps prose", () => {
  const verge = '<figure><img alt="" src="https://img.example/a.jpg" /><figcaption>Two people on stage. | Getty Images</figcaption></figure><p class="wp-block-paragraph">The president held a <a href="https://x.example">briefing</a> on Monday.</p>';
  assert.equal(excerptText(verge), "The president held a briefing on Monday.");
  const guardian = '<p>Carrier announces agreement, CEO says</p><ul><li><p>Get our <a href="https://g.example/a">breaking news email</a>, <a href="https://g.example/b">free app</a> or <a href="https://g.example/c">daily news podcast</a></p></li><li><p><a href="https://g.example/d">A related headline about something else</a></p></li></ul><p>The airline is preparing to cut jobs.</p>';
  assert.equal(excerptText(guardian), "Carrier announces agreement, CEO says The airline is preparing to cut jobs.");
  // Prose bullets and bodies with nothing to remove come back untouched, which
  // is how the RSS reader knows to keep the parser's own snippet.
  const prose = "<ul><li>The model scores higher on reasoning, according to <a href=\"https://lab.example\">the lab</a>.</li><li>It ships today.</li></ul>";
  assert.equal(excerptMarkup(prose), prose);
  assert.equal(excerptMarkup("Plain &amp; simple text"), "Plain &amp; simple text");
  assert.equal(excerptText("<figure><img src=\"x\">unterminated"), "unterminated");
});

test("common named entities decode once; unknown and escaped names stay as written", () => {
  assert.equal(decodeEntities("Caf&eacute; &mdash; &ldquo;AI&rdquo; &hellip; &euro;5 &Uuml;ber&nbsp;fast"), "Café — “AI” … €5 Über fast");
  assert.equal(decodeEntities("&amp;mdash; &bogus; AT&T; R&D"), "&mdash; &bogus; AT&T; R&D");
});
