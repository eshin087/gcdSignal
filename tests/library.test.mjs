import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-ts.mjs";

const library = load("../lib/library.ts");
const { createLibraryRecord, mergeLibraryRecord, mergeBackupRecord, pruneLibraryRecords, searchLibrary, parseLibraryBackup, serializeLibraryBackup, validateLibraryItem, safeLibraryUrl } = library;
const now = Date.now();
const item = (id = "one", extra = {}) => ({ id, source: "rss", title: "Anthropic announces a research model", url: `https://example.com/news/${id}`, timestamp: new Date(now).toISOString(), author: "Ada Researcher", sourceMeta: "Research Daily", excerpt: "A new evaluation of agent safety.", curation: { kind: "Research", topics: ["research", "security"], reasons: ["Research coverage"], builder: false, primary: true, substantive: true }, ...extra });
const record = (id = "one", extra = {}) => ({ ...createLibraryRecord(item(id), now), ...extra });

test("server library snapshot has no fabricated current-session boundary", () => {
  assert.equal(library.EMPTY_LIBRARY.sessionStartedAt, 0);
  assert.equal(library.EMPTY_LIBRARY.previousVisitAt, null);
});

test("archive retains at most 5000 unsaved stories while never evicting saves, notes or follows", () => {
  const pool = Array.from({ length: 5002 }, (_, i) => record(String(i), { lastSeenAt: now - i }));
  const old = now - 31 * 86400000;
  pool.push(record("old-unsaved", { lastSeenAt: old }), record("old-save", { savedAt: old, lastSeenAt: old }), record("old-note", { note: "Important to keep", lastSeenAt: old }), record("old-follow", { followedAt: old, lastSeenAt: old }));
  const kept = pruneLibraryRecords(pool, now);
  assert.equal(kept.length, 5003);
  assert.equal(kept.some((entry) => entry.item.id === "old-unsaved"), false);
  for (const id of ["old-save", "old-note", "old-follow"]) assert.ok(kept.some((entry) => entry.item.id === id));
});

test("search spans title, company, author, source, topic, notes and filters", () => {
  const first = record("one", { savedAt: now, note: "Present at strategy meeting", collection: "Work" });
  const second = record("two", { readAt: now });
  const third = record("three", { dismissedAt: now });
  assert.equal(searchLibrary([first, second, third], { query: "anthropic ada strategy", saved: true, unread: true, source: "rss", kind: "Research", topic: "security", collection: "Work", after: new Date(now - 86400000).toISOString().slice(0, 10) }).length, 1);
  assert.equal(searchLibrary([first, second, third]).length, 2);
  assert.equal(searchLibrary([third], { includeDismissed: true }).length, 1);
  assert.equal(searchLibrary([first], { source: "youtube" }).length, 0);
});

test("shared article reposts preserve identity, read state, saves, notes and additional coverage", () => {
  const first = record("one", { savedAt: now - 100, readAt: now - 50, note: "Remember this", followedAt: now - 40 });
  const repost = createLibraryRecord(item("hn-repost", { source: "hackernews", url: "https://news.ycombinator.com/item?id=123", externalUrl: "https://example.com/news/one?utm_source=hn" }), now + 1000);
  assert.equal(first.storyId, repost.storyId);
  const merged = mergeLibraryRecord(first, repost);
  assert.equal(merged.readAt, first.readAt);
  assert.equal(merged.savedAt, first.savedAt);
  assert.equal(merged.note, "Remember this");
  assert.equal(merged.followedAt, first.followedAt);
  assert.equal(searchLibrary([merged], { source: "rss" }).length, 1, "reposts retain their original source for filtering");
  assert.equal(searchLibrary([merged], { source: "hackernews" }).length, 1);
  assert.equal(merged.coverageAddedAt, now + 1000);
  const again = mergeLibraryRecord(merged, { ...repost, lastSeenAt: now + 2000 });
  assert.equal(again.coverageAddedAt, merged.coverageAddedAt, "polling the same URLs is not new coverage");
});

test("backup roundtrip preserves saved/read/follow state, notes, collections and searches", () => {
  const entries = [record("one", { savedAt: now, readAt: now, followedAt: now, note: "Useful & personal", collection: "Research" })];
  const searches = [{ id: "search-1", name: "Research unread", filters: { query: "Anthropic", unread: true } }];
  const parsed = parseLibraryBackup(serializeLibraryBackup(entries, searches, ["Anthropic", "AI safety"]));
  assert.equal(parsed.records[0].note, entries[0].note);
  assert.equal(parsed.records[0].savedAt, now);
  assert.equal(parsed.records[0].readAt, now);
  assert.equal(parsed.records[0].followedAt, now);
  assert.equal(parsed.records[0].collection, "Research");
  assert.equal(parsed.records[0].item.curation.primary, true);
  assert.deepEqual(parsed.savedSearches, searches);
  assert.deepEqual(parsed.followedTerms, ["Anthropic", "AI safety"]);
});

test("backup conflicts preserve both notes and imported collection information without duplication", () => {
  const existing = record("one", { note: "Current research note", collection: "Work" });
  const incoming = record("one", { note: "Older useful observation", collection: "Research", savedAt: now });
  const merged = mergeBackupRecord(existing, incoming);
  assert.ok(merged.note.includes(existing.note));
  assert.ok(merged.note.includes(incoming.note));
  assert.ok(merged.note.includes("Imported collection: Research"));
  assert.equal(merged.collection, "Work");
  assert.equal(merged.savedAt, now);
  assert.equal(mergeBackupRecord(merged, incoming).note, merged.note, "repeated import does not duplicate notes");
  assert.throws(() => mergeBackupRecord(record("one", { note: "a".repeat(8000) }), record("one", { note: "b".repeat(8000) })), /nothing was imported/);
});

test("imports reject active URLs, credential URLs, malformed dates and unsupported versions atomically", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,test", "file:///secret", "https://name:password@example.com/"]) {
    assert.equal(safeLibraryUrl(url), undefined);
    assert.equal(validateLibraryItem(item("bad", { url })), null);
    const backup = JSON.parse(serializeLibraryBackup([record()])); backup.records[0].item.url = url;
    assert.throws(() => parseLibraryBackup(JSON.stringify(backup)), /unsafe URL/);
  }
  assert.equal(validateLibraryItem(item("bad", { timestamp: "yesterday" })), null);
  assert.throws(() => parseLibraryBackup('{"format":"gcdsignal-library","version":8,"records":[]}'), /version 1/);
  assert.throws(() => parseLibraryBackup("not json"), /valid JSON/);
  const backup = JSON.parse(serializeLibraryBackup([record()])); backup.records[0].urls = ["javascript:alert(1)"];
  assert.throws(() => parseLibraryBackup(JSON.stringify(backup)), /unsafe coverage URL/);
  const invalidSave = JSON.parse(serializeLibraryBackup([record()])); invalidSave.records[0].savedAt = "invalid";
  assert.throws(() => parseLibraryBackup(JSON.stringify(invalidSave)), /personal-state dates/);
  const longNote = JSON.parse(serializeLibraryBackup([record()])); longNote.records[0].note = "x".repeat(10001);
  assert.throws(() => parseLibraryBackup(JSON.stringify(longNote)), /over-limit note/);
});

test("blocked IndexedDB preserves legacy saves, exposes a warning and leaves the original backup intact", async (t) => {
  const raw = JSON.stringify({ v: 1, items: [{ ...item("legacy"), savedAt: now - 50 }] });
  const removed = [];
  const globals = { window: {}, localStorage: { getItem: () => raw, removeItem: (key) => removed.push(key) }, indexedDB: { open() { throw new Error("Storage disabled"); } } };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key]; });
  }
  await library.initializeLibrary();
  assert.equal(library.getLibrarySnapshot().ready, true);
  assert.match(library.getLibrarySnapshot().storageWarning, /only in memory/);
  assert.equal(library.getLibrarySnapshot().records.find((entry) => entry.item.id === "legacy").savedAt, now - 50);
  assert.equal(removed.length, 0, "migration must not retire the original before an IDB transaction completes");
  await library.archiveItems([item("latest")]);
  library.markRead(item("latest"));
  await Promise.resolve(); await Promise.resolve();
  const before = library.getLibrarySnapshot().records.length;
  await assert.rejects(library.importLibrary("not a backup"));
  assert.equal(library.getLibrarySnapshot().records.length, before);
  assert.ok(library.getLibrarySnapshot().records.find((entry) => entry.item.id === "latest").readAt);
  assert.equal(JSON.parse(library.exportLibrary()).records.some((entry) => entry.item.id === "legacy"), true);
});
