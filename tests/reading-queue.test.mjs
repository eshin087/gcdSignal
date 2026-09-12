import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-ts.mjs";
const { createReadingQueueStore, validateReadingQueueEntry, parseReadingQueueBackup, serializeReadingQueue, mergeReadingQueueItems, READING_QUEUE_KEY, READING_QUEUE_LIMIT } = load("../lib/reading-queue.ts");

const entry = (n, extra = {}) => ({ id: `feed:${n}`, title: `AI research ${n}`, source: "Research", url: `https://example.com/research/${n}`, ...extra });
const item = (n, extra = {}) => ({ ...entry(n), addedAt: n, ...extra });
function fixture(initial = null) {
  const data = new Map(initial === null ? [] : [[READING_QUEUE_KEY, initial]]);
  const state = { failRead: false, failWrite: false, writes: 0 };
  const storage = { getItem(key) { if (state.failRead) throw new Error("blocked"); return data.get(key) ?? null; }, setItem(key, value) { if (state.failWrite) throw new Error("quota"); state.writes++; data.set(key, value); } };
  return { store: createReadingQueueStore(() => storage), data, state };
}

test("queue validation accepts safe outbound links and drops unknown fields", () => {
  assert.deepEqual(validateReadingQueueEntry({ ...entry(1), code: "<script>not retained</script>" }), entry(1));
  assert.ok(validateReadingQueueEntry(entry(1, { url: "http://example.com/reading" })));
  for (const url of ["javascript:alert(1)", "data:text/html,test", "//example.com", "https://user:pass@example.com", "https://example.com/\nsecret", "file:///tmp/test"]) assert.equal(validateReadingQueueEntry(entry(1, { url })), null, url);
  for (const value of [null, [], {}, entry(1, { id: "" }), entry(1, { id: "a".repeat(513) }), entry(1, { title: "a".repeat(501) }), entry(1, { source: "" }), entry(1, { id: "\u0000bad" }), entry(1, { url: `https://example.com/${"界".repeat(1360)}` })]) assert.equal(validateReadingQueueEntry(value), null);
});

test("queue backups preserve content, reject bad versions/items, and bound input", () => {
  const rows = [item(1), item(2, { title: "AI <paper> — details" })];
  assert.deepEqual(parseReadingQueueBackup(serializeReadingQueue(rows)), rows);
  for (const raw of ["not json", "null", "[]", JSON.stringify({ schemaVersion: 2, items: rows }), serializeReadingQueue([item(1, { addedAt: -1 })]), serializeReadingQueue([item(1, { url: "javascript:alert(1)" })]), serializeReadingQueue(Array.from({ length: 201 }, (_, n) => item(n))), " ".repeat(2 * 1024 * 1024 + 1)]) assert.throws(() => parseReadingQueueBackup(raw));
});

test("the largest valid queue remains below the import limit and round-trips", () => {
  const rows = Array.from({ length: READING_QUEUE_LIMIT }, (_, n) => item(n, {
    id: `${n}:${"界".repeat(500)}`,
    title: "界".repeat(500),
    source: "界".repeat(100),
    url: `https://example.com/${n}/${"a".repeat(4000)}`,
  }));
  const raw = serializeReadingQueue(rows);
  assert.ok(new TextEncoder().encode(raw).byteLength <= 2 * 1024 * 1024);
  assert.equal(parseReadingQueueBackup(raw).length, READING_QUEUE_LIMIT);
});

test("same identity or URL deduplicates without moving existing stories", () => {
  const rows = mergeReadingQueueItems([item(2), item(1)], [item(4, { url: item(1).url + "#discussion" }), item(2, { title: "Repost" }), item(3)]);
  assert.deepEqual(rows.map((row) => row.id), ["feed:1", "feed:2", "feed:3"]);
  assert.equal(rows[1].title, "AI research 2");
});

test("queue additions persist, duplicate safely, and Done changes only its own key", () => {
  const { store, data } = fixture();
  data.set("gcdsignal:x-links:v1", '["https://x.com/test/status/1"]');
  data.set("library-example", "saved material");
  let calls = 0; const stop = store.subscribe(() => calls++);
  assert.equal(store.getSnapshot().ready, false);
  store.initialize();
  assert.equal(store.add(entry(1)), true);
  assert.equal(store.add(entry(1)), true);
  assert.equal(store.add(entry(2)), true);
  assert.equal(store.getSnapshot().items.length, 2);
  assert.equal(store.remove("feed:1"), true);
  assert.equal(store.remove("missing"), false);
  assert.deepEqual(parseReadingQueueBackup(data.get(READING_QUEUE_KEY)).map((row) => row.id), ["feed:2"]);
  assert.equal(data.get("library-example"), "saved material");
  assert.equal(data.get("gcdsignal:x-links:v1"), '["https://x.com/test/status/1"]');
  assert.ok(calls > 0); stop();
  const restored = createReadingQueueStore(() => ({ getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) }));
  restored.initialize(); assert.deepEqual(restored.getSnapshot().items, store.getSnapshot().items);
});

test("quota failures retain additions and removals in memory and retry safely", () => {
  const { store, state, data } = fixture(serializeReadingQueue([item(1)]));
  state.failWrite = true;
  assert.equal(store.add(entry(2)), true);
  assert.equal(store.remove("feed:1"), true);
  assert.deepEqual(store.getSnapshot().items.map((row) => row.id), ["feed:2"]);
  assert.match(store.getSnapshot().warning, /could not be saved/);
  assert.deepEqual(parseReadingQueueBackup(store.export()).map((row) => row.id), ["feed:2"]);
  assert.deepEqual(parseReadingQueueBackup(data.get(READING_QUEUE_KEY)).map((row) => row.id), ["feed:1"]);
  state.failWrite = false;
  assert.equal(store.retry(), true);
  assert.equal(store.getSnapshot().warning, null);
  assert.deepEqual(parseReadingQueueBackup(data.get(READING_QUEUE_KEY)).map((row) => row.id), ["feed:2"]);
});

test("unreadable or malformed prior data is never overwritten by new queue actions", () => {
  for (const malformed of [true, false]) {
    const original = malformed ? "bad existing data" : serializeReadingQueue([item(1)]);
    const { store, state, data } = fixture(original);
    state.failRead = !malformed;
    store.add(entry(2));
    assert.equal(state.writes, 0);
    assert.equal(data.get(READING_QUEUE_KEY), original);
    assert.match(store.getSnapshot().warning, /has not been overwritten/);
    assert.equal(store.getSnapshot().items.length, 1);
    const recovery = JSON.parse(store.export());
    assert.equal(recovery.recoveryScope, "visible-items-in-this-tab-only");
    assert.deepEqual(recovery.items.map((row) => row.id), ["feed:2"]);
    state.failRead = false;
    if (malformed) data.set(READING_QUEUE_KEY, serializeReadingQueue([item(1)]));
    assert.equal(store.retry(), true);
    assert.deepEqual(store.getSnapshot().items.map((row) => row.id), ["feed:1", "feed:2"]);
  }
});

test("refresh clears recovered read warnings and stale storage gets a recovery export", () => {
  const { store, state } = fixture(serializeReadingQueue([item(1)]));
  state.failRead = true;
  store.initialize();
  assert.match(store.getSnapshot().warning, /could not be read/);
  const recovery = JSON.parse(store.export());
  assert.equal(recovery.recoveryScope, "visible-items-in-this-tab-only");
  assert.deepEqual(recovery.items, []);
  assert.match(store.getSnapshot().warning, /could not be read/);
  state.failRead = false;
  assert.equal(store.refresh(), true);
  assert.equal(store.getSnapshot().warning, null);
  assert.deepEqual(parseReadingQueueBackup(store.export()).map((row) => row.id), ["feed:1"]);
});

test("recovered reads replace stale read warnings while retaining pending changes", () => {
  const { store, state } = fixture(serializeReadingQueue([item(1)]));
  state.failRead = true;
  store.add(entry(2));
  assert.match(store.getSnapshot().warning, /could not be read/);
  state.failRead = false;
  assert.equal(store.refresh(), true);
  assert.match(store.getSnapshot().warning, /could not be saved/);
  assert.deepEqual(parseReadingQueueBackup(store.export()).map((row) => row.id), ["feed:1", "feed:2"]);
  assert.equal(store.retry(), true);
  assert.equal(store.getSnapshot().warning, null);
});

test("fresh changes from another tab are retained and capacity never evicts stories", () => {
  const { store, data } = fixture(); store.initialize();
  data.set(READING_QUEUE_KEY, serializeReadingQueue([item(1)]));
  assert.deepEqual(parseReadingQueueBackup(store.export()).map((row) => row.id), ["feed:1"], "export refreshes external storage changes");
  data.set(READING_QUEUE_KEY, serializeReadingQueue([item(1), item(3)]));
  store.refresh();
  assert.deepEqual(store.getSnapshot().items.map((row) => row.id), ["feed:1", "feed:3"], "storage-event refresh updates the live snapshot");
  store.add(entry(2));
  assert.equal(store.getSnapshot().items.length, 3);
  const full = Array.from({ length: READING_QUEUE_LIMIT }, (_, n) => item(n));
  data.set(READING_QUEUE_KEY, serializeReadingQueue(full));
  assert.equal(store.add(entry(999)), false);
  assert.equal(store.getSnapshot().items.length, READING_QUEUE_LIMIT);
  assert.match(store.getSnapshot().warning, /nothing was removed/);
});

test("import merges atomically, keeps old entries, and rejects an overfull result", () => {
  const { store } = fixture(serializeReadingQueue([item(1)]));
  assert.deepEqual(store.import(serializeReadingQueue([item(1), item(2)])), { ok: true, added: 1 });
  assert.deepEqual(store.getSnapshot().items.map((row) => row.id), ["feed:1", "feed:2"]);
  const before = store.export();
  assert.equal(store.import("invalid").ok, false);
  assert.equal(store.import(serializeReadingQueue(Array.from({ length: 200 }, (_, n) => item(n + 10)))).ok, false);
  assert.equal(store.export(), before);
});
