// Isolated real IndexedDB regression. No live site, API, or user browser storage.
// PLAYWRIGHT_PATH may point to the bundled Playwright install.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const root = resolve(import.meta.dirname, "..");
const modules = {};
function bundle(file) {
  const id = relative(root, file).replaceAll("\\", "/");
  if (modules[id]) return id;
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  modules[id] = code.replace(/require\("(\.[^"]+)"\)/g, (_match, path) => `require(${JSON.stringify(bundle(resolve(dirname(file), path + ".ts")))})`);
  return id;
}
const entry = bundle(resolve(root, "lib/library.ts"));
const script = `(() => { const modules = ${JSON.stringify(modules)}, cache = {}; function load(id) { if (cache[id]) return cache[id].exports; const module = { exports: {} }; cache[id] = module; new Function('require', 'exports', 'module', modules[id])(load, module.exports, module); return module.exports; } globalThis.SignalLibrary = load(${JSON.stringify(entry)}); })();`;
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "chrome" });
try {
  const context = await browser.newContext();
  await context.route("https://signal-library.test/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Isolated library test</title>" }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("https://signal-library.test/");
  await page.evaluate(() => localStorage.setItem("gcdsignal:saved", JSON.stringify({ v: 1, items: [{ id: "legacy", source: "rss", title: "A primary AI model announcement", url: "https://example.com/model", timestamp: new Date().toISOString(), savedAt: Date.now() - 1000 }] })));
  await page.addScriptTag({ content: script });
  const initial = await page.evaluate(async () => {
    await SignalLibrary.initializeLibrary();
    return { records: SignalLibrary.getLibrarySnapshot().records, warning: SignalLibrary.getLibrarySnapshot().storageWarning, legacy: localStorage.getItem("gcdsignal:saved") };
  });
  assert.equal(initial.warning, null);
  assert.equal(initial.legacy, null, "legacy saves retire only after successful migration transaction");
  assert.equal(initial.records.length, 1);
  assert.ok(initial.records[0].savedAt);
  assert.equal(initial.records[0].readAt, undefined, "archiving/migration does not imply reading");
  const storyId = initial.records[0].storyId;
  await page.evaluate(async (key) => {
    const original = SignalLibrary.getLibrarySnapshot().records[0].item;
    SignalLibrary.markRead(original);
    SignalLibrary.updateLibraryItem(key, { note: "Keep this for work", collection: "Work" });
    SignalLibrary.toggleFollowStory(original);
    SignalLibrary.saveLibrarySearch("Models", { query: "model", saved: true });
    SignalLibrary.setFollowedTerms(["AI research"]);
    await SignalLibrary.archiveItems([{ ...original, id: "hn-repost", source: "hackernews", url: "https://news.ycombinator.com/item?id=42", externalUrl: original.url }]);
    // Empty validated merge waits until the local write queue has committed.
    await SignalLibrary.importLibrary(JSON.stringify({ format: "gcdsignal-library", version: 1, records: [] }));
  }, storyId);
  const saved = await page.evaluate(() => JSON.parse(SignalLibrary.exportLibrary()));
  assert.equal(saved.records.length, 1, "reposts resolve to the same archive record");
  assert.equal(saved.records[0].note, "Keep this for work");
  assert.equal(saved.records[0].collection, "Work");
  assert.ok(saved.records[0].readAt);
  assert.ok(saved.records[0].followedAt);
  assert.ok(saved.records[0].coverageAddedAt);
  await page.reload();
  await page.addScriptTag({ content: script });
  const reloaded = await page.evaluate(async () => { await SignalLibrary.initializeLibrary(); return JSON.parse(SignalLibrary.exportLibrary()); });
  assert.deepEqual(reloaded.records, saved.records, "saves, read state, coverage, notes and collections survive reload");
  assert.deepEqual(reloaded.savedSearches, saved.savedSearches);
  assert.deepEqual(reloaded.followedTerms, saved.followedTerms);
  const priorSession = await page.evaluate(async () => {
    await SignalLibrary.archiveItems([{ id: "known-unread", source: "rss", title: "Previously collected AI research", url: "https://example.com/known-unread", timestamp: new Date().toISOString() }]);
    await SignalLibrary.importLibrary(JSON.stringify({ format: "gcdsignal-library", version: 1, records: [] }));
    return SignalLibrary.getLibrarySnapshot().sessionStartedAt;
  });
  await page.reload();
  await page.addScriptTag({ content: script });
  const catchup = await page.evaluate(async () => {
    await SignalLibrary.initializeLibrary();
    const snapshot = SignalLibrary.getLibrarySnapshot();
    const known = snapshot.records.find((record) => record.item.id === "known-unread");
    return { previousVisitAt: snapshot.previousVisitAt, sessionStartedAt: snapshot.sessionStartedAt, firstSeenAt: known.firstSeenAt, readAt: known.readAt, newThisVisit: !known.readAt && known.firstSeenAt >= snapshot.sessionStartedAt };
  });
  assert.equal(catchup.previousVisitAt, priorSession);
  assert.ok(catchup.sessionStartedAt > priorSession);
  assert.equal(catchup.readAt, undefined);
  assert.ok(catchup.firstSeenAt < catchup.sessionStartedAt, "previous-session collection predates the current session boundary");
  assert.equal(catchup.newThisVisit, false, "a previously collected unread story is not new again after reload");
  const before = await page.evaluate(() => SignalLibrary.getLibrarySnapshot().records.length);
  const rejection = await page.evaluate(async () => { try { await SignalLibrary.importLibrary('{"format":"gcdsignal-library","version":1,"records":[{"item":{"id":"bad","source":"rss","url":"javascript:alert(1)","title":"bad","timestamp":"2026-01-01"}}]}'); return false; } catch { return true; } });
  assert.equal(rejection, true);
  assert.equal(await page.evaluate(() => SignalLibrary.getLibrarySnapshot().records.length), before);
  // Deliberately suppress broadcasts in tab B to reproduce a stale same-story
  // snapshot. Transactional deltas, not timely notifications, must keep data safe.
  await page.evaluate(async () => {
    await SignalLibrary.archiveItems([
      { id: "concurrent", source: "rss", title: "AI concurrent tab research", url: "https://example.com/concurrent", timestamp: new Date().toISOString() },
      { id: "prune-protect", source: "rss", title: "AI story saved before pruning", url: "https://example.com/prune-protect", timestamp: new Date().toISOString() },
    ]);
    await SignalLibrary.importLibrary(JSON.stringify({ format: "gcdsignal-library", version: 1, records: [] }));
  });
  const other = await context.newPage();
  await other.addInitScript(() => Object.defineProperty(window, "BroadcastChannel", { configurable: true, value: class { postMessage() {} close() {} } }));
  await other.goto("https://signal-library.test/");
  await other.addScriptTag({ content: script });
  await other.evaluate(() => SignalLibrary.initializeLibrary());
  await page.evaluate(async () => {
    const entry = SignalLibrary.getLibrarySnapshot().records.find((record) => record.item.id === "concurrent");
    SignalLibrary.toggleLibrarySaved(entry.item);
    SignalLibrary.toggleLibrarySaved(SignalLibrary.getLibrarySnapshot().records.find((record) => record.item.id === "prune-protect").item);
    SignalLibrary.updateLibraryItem(entry.storyId, { note: "Note written in tab A" });
    SignalLibrary.setFollowedTerms([...SignalLibrary.getLibrarySnapshot().followedTerms, "Tab A topic"]);
    SignalLibrary.saveLibrarySearch("Tab A search", { query: "alpha" });
    await SignalLibrary.importLibrary(JSON.stringify({ format: "gcdsignal-library", version: 1, records: [] }));
  });
  assert.equal(await other.evaluate(() => SignalLibrary.getLibrarySnapshot().records.find((record) => record.item.id === "concurrent").savedAt), undefined, "tab B intentionally has stale unsaved state");
  await other.evaluate(async () => {
    const entry = SignalLibrary.getLibrarySnapshot().records.find((record) => record.item.id === "concurrent");
    SignalLibrary.markRead(entry.item);
    SignalLibrary.updateLibraryItem(entry.storyId, { collection: "Collection from tab B" });
    SignalLibrary.setFollowedTerms([...SignalLibrary.getLibrarySnapshot().followedTerms, "Tab B topic"]);
    SignalLibrary.saveLibrarySearch("Tab B search", { query: "beta" });
    const actualNow = Date.now;
    Date.now = () => actualNow() + 31 * 86400000;
    try { await SignalLibrary.archiveItems([{ id: "later", source: "rss", title: "AI later research", url: "https://example.com/later", timestamp: new Date(Date.now()).toISOString() }]); }
    finally { Date.now = actualNow; }
    await SignalLibrary.importLibrary(JSON.stringify({ format: "gcdsignal-library", version: 1, records: [] }));
  });
  await page.reload();
  await page.addScriptTag({ content: script });
  const concurrent = await page.evaluate(async () => { await SignalLibrary.initializeLibrary(); const data = JSON.parse(SignalLibrary.exportLibrary()); return { entry: data.records.find((record) => record.item.id === "concurrent"), protected: data.records.find((record) => record.item.id === "prune-protect"), terms: data.followedTerms, searches: data.savedSearches }; });
  assert.ok(concurrent.entry.savedAt, "tab B read must not erase tab A save");
  assert.ok(concurrent.entry.readAt);
  assert.equal(concurrent.entry.note, "Note written in tab A", "tab B collection must not erase tab A note");
  assert.equal(concurrent.entry.collection, "Collection from tab B");
  assert.ok(concurrent.protected?.savedAt, "stale archive pruning cannot delete another tab's saved story");
  assert.ok(concurrent.terms.includes("Tab A topic") && concurrent.terms.includes("Tab B topic"));
  assert.ok(concurrent.searches.some((search) => search.name === "Tab A search") && concurrent.searches.some((search) => search.name === "Tab B search"));
  await other.close();
  assert.deepEqual(errors, []);
  await context.close();
  process.stdout.write("Library browser regression passed: atomic legacy migration, explicit read, repost identity, follow, notes, collections, searches, reload durability, unsafe import rejection, stale two-tab save/note/read/search merge.\n");
} finally { await browser.close(); }
