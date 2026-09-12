import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-ts.mjs";
const { DEFAULT_PREFS, parsePrefs } = load("../lib/use-prefs.ts");
const { DEFAULT_ORDER, PANEL_LABELS, SOURCE_IDS, deckKnownIds, effectiveOrder, isPanelId } = load("../lib/feeds.ts");
const { parseXLink } = load("../lib/x-links.ts");

test("new readers get Broad, All AI and Brief with a visible X discovery column", () => {
  assert.equal(DEFAULT_PREFS.v, 9);
  assert.equal(DEFAULT_PREFS.contentMode, "broad");
  assert.equal(DEFAULT_PREFS.category, "trending");
  assert.equal(DEFAULT_PREFS.view, "brief");
  assert.ok(DEFAULT_PREFS.hidden.includes("top10"));
  assert.ok(DEFAULT_PREFS.hidden.includes("bluesky"));
  assert.ok(!DEFAULT_PREFS.hidden.includes("x-discovery"));
  assert.equal(DEFAULT_ORDER[DEFAULT_ORDER.indexOf("rss") + 1], "x-discovery");
  assert.ok(isPanelId("x-discovery"));
  assert.equal(PANEL_LABELS["x-discovery"], "AI on X");
  assert.ok(!SOURCE_IDS.includes("x-discovery"), "X uses its discovery contract, not a native source feed");
  assert.ok(deckKnownIds([]).includes("x-discovery"));
  assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
});
test("legacy defaults migrate once without losing custom feeds, mutes, display or interests", () => {
  const old = { v: 6, contentMode: "builder", view: "deck", category: "research", followedTopics: ["research"], mutedAuthors: ["reddit:reader"], hidden: ["youtube"],
    custom: [{ id: "custom:123", source: "rss", label: "My feed", params: { url: "https://example.com/rss" } }], textScale: "lg", density: "compact" };
  const next = parsePrefs(JSON.stringify(old));
  assert.equal(next.v, 9); assert.equal(next.contentMode, "broad"); assert.equal(next.view, "brief");
  for (const key of ["category", "followedTopics", "mutedAuthors", "custom", "textScale", "density"]) assert.deepEqual(next[key], old[key]);
  assert.deepEqual(next.hidden, ["youtube", "top10", "bluesky"]);
  const optedIn = parsePrefs(JSON.stringify({ ...next, contentMode: "builder", view: "deck" }));
  assert.equal(optedIn.contentMode, "builder"); assert.equal(optedIn.view, "deck");
});
test("v7 readers keep their chosen mode, view and settings while Bluesky becomes opt-in", () => {
  for (const view of ["brief", "deck", "library"]) {
    const previous = { ...DEFAULT_PREFS, v: 7, contentMode: "builder", view, hidden: ["youtube"],
      custom: [{ id: "custom:bluesky", source: "bluesky", label: "My Bluesky feed", params: { q: "OpenAI" } }],
      category: "research", textScale: "lg", density: "compact", order: ["youtube", "bluesky", "rss"],
      followedTopics: ["research"], mutedAuthors: ["reddit:reader"], mutedOutlets: ["example.com"], refreshMs: 0 };
    const migrated = parsePrefs(JSON.stringify(previous));
    assert.deepEqual(migrated, { ...previous, v: 9, hidden: ["youtube", "bluesky"], order: ["youtube", "bluesky", "rss", "x-discovery"] });
  }
});
test("legacy X view opens the homepage without losing Bluesky opt-in or other choices", () => {
  const previous = { ...DEFAULT_PREFS, v: 8, hidden: DEFAULT_PREFS.hidden.filter((id) => id !== "bluesky"), view: "x",
    contentMode: "builder", category: "research", order: ["youtube", "rss", "custom:123", "reddit"],
    custom: [{ id: "custom:123", source: "rss", label: "My feed", params: { url: "https://example.com/rss" } }],
    mutedAuthors: ["reddit:reader"], mutedOutlets: ["example.com"], followedTopics: ["research"], textScale: "lg", refreshMs: 0 };
  const migrated = parsePrefs(JSON.stringify(previous));
  assert.deepEqual(migrated, { ...previous, v: 9, view: "brief", order: ["youtube", "rss", "x-discovery", "custom:123", "reddit"] });
  assert.deepEqual(parsePrefs(JSON.stringify(migrated)), migrated, "migration applies only once");
});
test("v8 readers retain their view and relative column order while X is added", () => {
  for (const view of ["brief", "deck", "library"]) {
    const previous = { ...DEFAULT_PREFS, v: 8, view, order: ["youtube", "reddit"] };
    assert.deepEqual(parsePrefs(JSON.stringify(previous)), { ...previous, v: 9, order: ["x-discovery", "youtube", "reddit"] });
  }
  const alreadyPlaced = { ...DEFAULT_PREFS, v: 8, order: ["x-discovery", "youtube", "rss", "reddit"] };
  assert.deepEqual(parsePrefs(JSON.stringify(alreadyPlaced)).order, alreadyPlaced.order);
});
test("v9 readers keep explicit X visibility and order choices", () => {
  const chosen = { ...DEFAULT_PREFS, view: "deck", hidden: [...DEFAULT_PREFS.hidden.filter((id) => id !== "bluesky"), "x-discovery"],
    order: ["reddit", "x-discovery", "youtube", "rss"] };
  assert.deepEqual(parsePrefs(JSON.stringify(chosen)), chosen);
  assert.deepEqual(effectiveOrder(chosen.order, deckKnownIds([])).slice(0, chosen.order.length), chosen.order);
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
  for (const account of ["@OpenAI", "OpenAI", "  @OpenAI  "]) assert.deepEqual(parseXLink(account), { url: "https://x.com/OpenAI", kind: "profile" });
  for (const account of ["@bad-name", "@@name", "@home", "@handle/evil", "@abcdefghijklmnop"]) assert.equal(parseXLink(account), null, account);
  for (const url of ["http://x.com/OpenAI", "javascript:alert(1)", "https://x.com.evil.example/OpenAI", "https://x.com@evil.example/OpenAI", "https://user:pass@x.com/OpenAI", "https://x.com:444/OpenAI", "https://x.com/home", "https://x.com/search?q=AI", "https://x.com/i/lists/not-a-number", "<script src='x'>"]) assert.equal(parseXLink(url), null, url);
});
