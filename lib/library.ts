import { canonicalUrl, stableStoryId } from "./stories";
import type { FeedItem, SourceId } from "./types";

/** Browser-local, versioned research data. No account or remote sync is involved. */
export interface LibraryRecord {
  storyId: string;
  item: FeedItem;
  firstSeenAt: number;
  lastSeenAt: number;
  coverageAddedAt?: number;
  urls: string[];
  sources?: SourceId[];
  authors?: string[];
  sourceLabels?: string[];
  readAt?: number;
  savedAt?: number;
  dismissedAt?: number;
  followedAt?: number;
  note: string;
  collection: string;
}

export interface LibraryFilters {
  query?: string;
  source?: string;
  topic?: string;
  kind?: string;
  after?: string;
  unread?: boolean;
  saved?: boolean;
  followed?: boolean;
  collection?: string;
  includeDismissed?: boolean;
}

export interface SavedSearch { id: string; name: string; filters: LibraryFilters }
interface LibraryMeta {
  savedSearches: SavedSearch[];
  followedTerms: string[];
  lastVisitAt: number | null;
  readKeys: Record<string, number>;
}
export interface LibrarySnapshot {
  records: readonly LibraryRecord[];
  savedSearches: readonly SavedSearch[];
  followedTerms: readonly string[];
  previousVisitAt: number | null;
  /** Current page-session boundary; imported/previously collected unread items predate it. */
  sessionStartedAt: number;
  ready: boolean;
  storageWarning: string | null;
  readKeys: ReadonlySet<string>;
}

export const ARCHIVE_DAYS = 30;
export const ARCHIVE_LIMIT = 5000;
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
const MAX_IMPORT_RECORDS = 20000;
const SOURCES = new Set<SourceId>(["reddit", "fourchan", "bluesky", "hackernews", "rss", "youtube", "github", "papers"]);
const KINDS = new Set(["News", "Release", "Tool", "Tutorial", "Research", "Security", "Discussion", "Commentary"]);
const TOPICS = new Set(["trending", "development", "security", "vibecoding", "research", "industry"]);
const DB_NAME = "gcdsignal:library";
const LEGACY_SAVES = "gcdsignal:saved";
const EMPTY_META: LibraryMeta = { savedSearches: [], followedTerms: [], lastVisitAt: null, readKeys: {} };
export const EMPTY_LIBRARY: LibrarySnapshot = Object.freeze({ records: [], savedSearches: [], followedTerms: [], previousVisitAt: null, sessionStartedAt: 0, ready: false, storageWarning: null, readKeys: new Set<string>() });

/** Keep imports inert: only explicit web links, never javascript/data/credentials. */
export function safeLibraryUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4096) return undefined;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}
function time(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= Date.now() + 86400000 ? value : undefined;
}
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function validateLibraryItem(value: unknown): FeedItem | null {
  const raw = object(value);
  if (!raw || typeof raw.id !== "string" || !raw.id || raw.id.length > 512 || !SOURCES.has(raw.source as SourceId)) return null;
  const url = safeLibraryUrl(raw.url), title = text(raw.title, 2000);
  if (!url || !title || typeof raw.timestamp !== "string" || !Number.isFinite(Date.parse(raw.timestamp))) return null;
  if (raw.externalUrl !== undefined && !safeLibraryUrl(raw.externalUrl)) return null;
  const item: FeedItem = { id: raw.id, source: raw.source as SourceId, title, url, timestamp: new Date(raw.timestamp).toISOString() };
  if (raw.externalUrl) item.externalUrl = safeLibraryUrl(raw.externalUrl);
  if (typeof raw.thumbnail === "string" && raw.thumbnail.startsWith("https://")) item.thumbnail = safeLibraryUrl(raw.thumbnail);
  for (const field of ["author", "sourceMeta", "excerpt"] as const) {
    const value = text(raw[field], field === "excerpt" ? 12000 : 500);
    if (value) item[field] = value;
  }
  for (const field of ["score", "comments", "readMinutes", "durationSec"] as const) {
    if (typeof raw[field] === "number" && Number.isFinite(raw[field]) && raw[field] >= 0) item[field] = raw[field];
  }
  const curation = object(raw.curation);
  if (curation && KINDS.has(String(curation.kind))) {
    item.curation = {
      kind: curation.kind as NonNullable<FeedItem["curation"]>["kind"],
      topics: Array.isArray(curation.topics) ? curation.topics.filter((t) => TOPICS.has(String(t))).slice(0, 6) as NonNullable<FeedItem["curation"]>["topics"] : [],
      reasons: Array.isArray(curation.reasons) ? curation.reasons.filter((r): r is string => typeof r === "string").slice(0, 10).map((r) => r.slice(0, 500)) : [],
      builder: curation.builder === true,
      primary: curation.primary === true,
      substantive: curation.substantive === true,
      sponsored: curation.sponsored === true,
    };
  }
  return item;
}

export function createLibraryRecord(item: FeedItem, now = Date.now()): LibraryRecord {
  return { storyId: stableStoryId(item), item, firstSeenAt: now, lastSeenAt: now, urls: [...new Set([item.url, item.externalUrl].filter((url): url is string => !!url).map(canonicalUrl))], sources: [item.source], authors: item.author ? [item.author] : [], sourceLabels: item.sourceMeta ? [item.sourceMeta] : [], note: "", collection: "" };
}

export function mergeLibraryRecord(existing: LibraryRecord, incoming: LibraryRecord): LibraryRecord {
  const urls = [...new Set([...existing.urls, ...incoming.urls])].slice(-100);
  const added = incoming.urls.some((url) => !existing.urls.includes(url));
  return {
    ...existing,
    item: incoming.lastSeenAt >= existing.lastSeenAt ? incoming.item : existing.item,
    firstSeenAt: Math.min(existing.firstSeenAt, incoming.firstSeenAt),
    lastSeenAt: Math.max(existing.lastSeenAt, incoming.lastSeenAt),
    urls,
    sources: [...new Set([...(existing.sources ?? [existing.item.source]), ...(incoming.sources ?? [incoming.item.source])])],
    authors: [...new Set([...(existing.authors ?? []), ...(incoming.authors ?? [])])].slice(-100),
    sourceLabels: [...new Set([...(existing.sourceLabels ?? []), ...(incoming.sourceLabels ?? [])])].slice(-100),
    coverageAddedAt: added ? Math.max(incoming.lastSeenAt, existing.coverageAddedAt ?? 0) : existing.coverageAddedAt,
    savedAt: existing.savedAt ?? incoming.savedAt,
    readAt: existing.readAt ?? incoming.readAt,
    followedAt: existing.followedAt ?? incoming.followedAt,
    dismissedAt: existing.dismissedAt ?? incoming.dismissedAt,
    note: existing.note || incoming.note,
    collection: existing.collection || incoming.collection,
  };
}

/** Backup merges must not quietly throw away a different personal note. */
export function mergeBackupRecord(existing: LibraryRecord, incoming: LibraryRecord): LibraryRecord {
  const merged = mergeLibraryRecord(existing, incoming);
  if (existing.note && incoming.note && existing.note !== incoming.note) {
    merged.note = existing.note.includes(incoming.note) ? existing.note
      : incoming.note.includes(existing.note) ? incoming.note
      : `${existing.note}\n\nImported note:\n${incoming.note}`;
  }
  if (existing.collection && incoming.collection && existing.collection !== incoming.collection) {
    const annotation = `Imported collection: ${incoming.collection}`;
    if (!merged.note.includes(annotation)) merged.note = [merged.note, annotation].filter(Boolean).join("\n\n");
  }
  if (merged.note.length > 10000) throw new Error("A conflicting imported note would exceed 10,000 characters. Shorten or reconcile that note first; nothing was imported.");
  return merged;
}

/** User-kept material is never silently evicted, regardless of archive limits. */
export function pruneLibraryRecords(records: readonly LibraryRecord[], now = Date.now()): LibraryRecord[] {
  const kept = records.filter((record) => record.savedAt || record.followedAt || record.note || record.collection);
  const archive = records.filter((record) => !record.savedAt && !record.followedAt && !record.note && !record.collection && record.lastSeenAt > now - ARCHIVE_DAYS * 86400000)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt).slice(0, ARCHIVE_LIMIT);
  return [...kept, ...archive];
}

export function searchLibrary(records: readonly LibraryRecord[], filters: LibraryFilters = {}): LibraryRecord[] {
  const terms = (filters.query ?? "").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const cutoff = filters.after ? Date.parse(filters.after) : NaN;
  return records.filter((record) => {
    const item = record.item;
    if (!filters.includeDismissed && record.dismissedAt) return false;
    if (filters.saved && !record.savedAt || filters.unread && record.readAt || filters.followed && !record.followedAt) return false;
    if (filters.source && !(record.sources ?? [item.source]).includes(filters.source as SourceId) || filters.kind && filters.kind !== item.curation?.kind) return false;
    if (filters.topic && !item.curation?.topics.includes(filters.topic as NonNullable<FeedItem["curation"]>["topics"][number])) return false;
    if (filters.collection && filters.collection !== record.collection) return false;
    if (Number.isFinite(cutoff) && Date.parse(item.timestamp) < cutoff) return false;
    const searchable = [item.title, item.excerpt, item.author, item.sourceMeta, item.source, ...(record.sources ?? []), ...(record.authors ?? []), ...(record.sourceLabels ?? []), item.url, item.curation?.kind, ...(item.curation?.topics ?? []), record.note, record.collection].join(" ").toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  }).sort((a, b) => Date.parse(b.item.timestamp) - Date.parse(a.item.timestamp));
}

function validateFilters(value: unknown): LibraryFilters {
  const raw = object(value) ?? {};
  const filters: LibraryFilters = {};
  for (const key of ["query", "source", "topic", "kind", "after", "collection"] as const) if (typeof raw[key] === "string") filters[key] = raw[key].slice(0, key === "query" ? 500 : 120);
  for (const key of ["unread", "saved", "followed", "includeDismissed"] as const) if (typeof raw[key] === "boolean") filters[key] = raw[key];
  return filters;
}

export function parseLibraryBackup(input: string): { records: LibraryRecord[]; savedSearches: SavedSearch[]; followedTerms: string[] } {
  if (new TextEncoder().encode(input).length > MAX_IMPORT_BYTES) throw new Error("Backup is too large (maximum 25 MB). Split large collections into smaller backups.");
  let parsed: Record<string, unknown> | undefined;
  try { parsed = object(JSON.parse(input)); } catch { throw new Error("That file is not valid JSON."); }
  if (!parsed || parsed.format !== "gcdsignal-library" || parsed.version !== 1 || !Array.isArray(parsed.records)) throw new Error("Choose a Signal library backup, version 1.");
  if (parsed.records.length > MAX_IMPORT_RECORDS) throw new Error("A backup can contain at most 20,000 records.");
  const records: LibraryRecord[] = [];
  for (const value of parsed.records) {
    const raw = object(value), item = validateLibraryItem(raw?.item);
    if (!raw || !item) throw new Error("Backup contains an invalid story or unsafe URL; nothing was imported.");
    const firstSeenAt = time(raw.firstSeenAt), lastSeenAt = time(raw.lastSeenAt);
    if (!firstSeenAt || !lastSeenAt) throw new Error("Backup contains invalid story dates; nothing was imported.");
    for (const field of ["savedAt", "readAt", "dismissedAt", "followedAt", "coverageAddedAt"] as const) {
      if (raw[field] !== undefined && time(raw[field]) === undefined) throw new Error("Backup contains invalid personal-state dates; nothing was imported.");
    }
    if (raw.note !== undefined && (typeof raw.note !== "string" || raw.note.length > 10000) || raw.collection !== undefined && (typeof raw.collection !== "string" || raw.collection.length > 100)) throw new Error("Backup contains an invalid or over-limit note/collection; nothing was imported.");
    const urls = Array.isArray(raw.urls) ? raw.urls.slice(0, 100).map(safeLibraryUrl) : [item.url];
    if (urls.some((url) => !url)) throw new Error("Backup contains an unsafe coverage URL; nothing was imported.");
    const labels = (value: unknown) => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").slice(0, 100).map((entry) => entry.slice(0, 500)) : [];
    records.push({ ...createLibraryRecord(item, firstSeenAt), lastSeenAt, urls: [...new Set((urls as string[]).map(canonicalUrl))], sources: [...new Set([item.source, ...(Array.isArray(raw.sources) ? raw.sources.filter((source) => SOURCES.has(source as SourceId)) as SourceId[] : [])])], authors: [...new Set([...(item.author ? [item.author] : []), ...labels(raw.authors)])], sourceLabels: [...new Set([...(item.sourceMeta ? [item.sourceMeta] : []), ...labels(raw.sourceLabels)])], savedAt: time(raw.savedAt), readAt: time(raw.readAt), dismissedAt: time(raw.dismissedAt), followedAt: time(raw.followedAt), coverageAddedAt: time(raw.coverageAddedAt), note: text(raw.note, 10000) ?? "", collection: text(raw.collection, 100) ?? "" });
  }
  const savedSearches: SavedSearch[] = [];
  if (Array.isArray(parsed.savedSearches)) for (const value of parsed.savedSearches.slice(0, 100)) {
    const raw = object(value);
    if (raw && typeof raw.id === "string" && typeof raw.name === "string") savedSearches.push({ id: raw.id.slice(0, 100), name: raw.name.slice(0, 100), filters: validateFilters(raw.filters) });
  }
  const followedTerms = Array.isArray(parsed.followedTerms) ? [...new Set(parsed.followedTerms.filter((term): term is string => typeof term === "string").map((term) => term.trim().slice(0, 100)).filter(Boolean))].slice(0, 100) : [];
  return { records, savedSearches, followedTerms };
}

export function serializeLibraryBackup(records: readonly LibraryRecord[], savedSearches: readonly SavedSearch[] = [], followedTerms: readonly string[] = []): string {
  return JSON.stringify({ format: "gcdsignal-library", version: 1, exportedAt: new Date().toISOString(), records, savedSearches, followedTerms }, null, 2);
}

let snapshot: LibrarySnapshot = EMPTY_LIBRARY;
let records = new Map<string, LibraryRecord>();
let meta: LibraryMeta = { ...EMPTY_META, readKeys: {} };
let db: IDBDatabase | null = null;
let initialized: Promise<void> | null = null;
let writes: Promise<void> = Promise.resolve();
let channel: BroadcastChannel | null = null;
let hasUnpersistedChanges = false;
let mutationRevision = 0;
// Baselines track this tab's last queued state, not another tab's latest value.
// Persisting only changed fields avoids clobbering a concurrent save/note/read.
let recordBaselines = new Map<string, LibraryRecord>();
let metaBaseline: LibraryMeta = structuredClone(EMPTY_META);
const listeners = new Set<() => void>();
const visitStartedAt = Date.now();

export const getLibrarySnapshot = (): LibrarySnapshot => snapshot;
export const subscribeLibrary = (listener: () => void): (() => void) => { listeners.add(listener); return () => listeners.delete(listener); };

function notify(warning: string | null = snapshot.storageWarning) {
  snapshot = { ...snapshot, sessionStartedAt: visitStartedAt, records: [...records.values()], savedSearches: meta.savedSearches, followedTerms: meta.followedTerms, storageWarning: warning, readKeys: new Set([...Object.keys(meta.readKeys), ...[...records.values()].filter((record) => record.readAt).map((record) => record.storyId)]) };
  for (const listener of listeners) listener();
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("records")) request.result.createObjectStore("records", { keyPath: "storyId" });
      if (!request.result.objectStoreNames.contains("meta")) request.result.createObjectStore("meta");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Another tab is blocking library storage. Close old Signal tabs and reload."));
  });
}

function readDatabase(): Promise<{ values: LibraryRecord[]; settings?: LibraryMeta }> {
  return new Promise((resolve, reject) => {
    const transaction = db!.transaction(["records", "meta"], "readonly");
    const all = transaction.objectStore("records").getAll();
    const settings = transaction.objectStore("meta").get("settings");
    transaction.oncomplete = () => resolve({ values: all.result as LibraryRecord[], settings: settings.result as LibraryMeta | undefined });
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

interface RecordDelta { record: LibraryRecord; fields: Partial<LibraryRecord> }
interface WriteBatch { updates: RecordDelta[]; removed: Array<{ key: string; lastSeenAt: number }>; before: LibraryMeta; settings: LibraryMeta }
function writeBatch(updates: readonly LibraryRecord[], removed: readonly string[]): WriteBatch {
  const changes = updates.map((record) => {
    const before = recordBaselines.get(record.storyId);
    const fields: Partial<LibraryRecord> = { storyId: record.storyId };
    const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(record)] as Array<keyof LibraryRecord>);
    for (const key of keys) {
      if (JSON.stringify(before?.[key]) === JSON.stringify(record[key])) continue;
      // Empty defaults on a newly discovered story are not an intent to erase
      // notes/collections which another tab may already have stored.
      if (!before && (key === "note" || key === "collection") && !record[key]) continue;
      Object.assign(fields, { [key]: record[key] });
    }
    recordBaselines.set(record.storyId, record);
    return Object.keys(fields).length > 1 ? { record, fields } : null;
  }).filter((change): change is RecordDelta => change !== null);
  const deletes = removed.map((key) => ({ key, lastSeenAt: recordBaselines.get(key)?.lastSeenAt ?? 0 }));
  for (const key of removed) recordBaselines.delete(key);
  const batch = { updates: changes, removed: deletes, before: metaBaseline, settings: structuredClone(meta) };
  metaBaseline = batch.settings;
  return batch;
}

function mergeMeta(current: LibraryMeta, before: LibraryMeta, next: LibraryMeta): LibraryMeta {
  const readKeys = { ...current.readKeys };
  for (const key of new Set([...Object.keys(before.readKeys), ...Object.keys(next.readKeys)])) {
    if (before.readKeys[key] === next.readKeys[key]) continue;
    if (next.readKeys[key]) readKeys[key] = next.readKeys[key]; else delete readKeys[key];
  }
  const searches = new Map(current.savedSearches.map((search) => [search.id, search]));
  const previous = new Map(before.savedSearches.map((search) => [search.id, search]));
  const following = new Set(current.followedTerms);
  for (const search of before.savedSearches) if (!next.savedSearches.some((entry) => entry.id === search.id)) searches.delete(search.id);
  for (const search of next.savedSearches) if (JSON.stringify(previous.get(search.id)) !== JSON.stringify(search)) searches.set(search.id, search);
  for (const term of before.followedTerms) if (!next.followedTerms.includes(term)) following.delete(term);
  for (const term of next.followedTerms) if (!before.followedTerms.includes(term)) following.add(term);
  return { readKeys, savedSearches: [...searches.values()], followedTerms: [...following], lastVisitAt: Math.max(current.lastVisitAt ?? 0, next.lastVisitAt ?? 0) || null };
}

/** Reads and merges inside the same IDB transaction, which serializes writers. */
function writeDatabase(batch: WriteBatch): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) { reject(new Error("Browser storage is unavailable.")); return; }
    const transaction = db.transaction(["records", "meta"], "readwrite");
    const store = transaction.objectStore("records");
    for (const { key, lastSeenAt } of batch.removed) {
      const read = store.get(key);
      read.onsuccess = () => {
        const current = read.result as LibraryRecord | undefined;
        // Archive pruning must never delete a save/note/follow made elsewhere.
        if (current && !current.savedAt && !current.followedAt && !current.note && !current.collection && current.lastSeenAt <= lastSeenAt) store.delete(key);
      };
    }
    for (const { record, fields } of batch.updates) {
      const read = store.get(record.storyId);
      read.onsuccess = () => {
        const current = read.result as LibraryRecord | undefined;
        const next = current ? { ...current, ...fields } : record;
        if (current) {
          next.firstSeenAt = Math.min(current.firstSeenAt, record.firstSeenAt);
          next.lastSeenAt = Math.max(current.lastSeenAt, record.lastSeenAt);
          next.urls = [...new Set([...current.urls, ...record.urls])].slice(-100);
          next.sources = [...new Set([...(current.sources ?? [current.item.source]), ...(record.sources ?? [record.item.source])])];
          next.authors = [...new Set([...(current.authors ?? []), ...(record.authors ?? [])])].slice(-100);
          next.sourceLabels = [...new Set([...(current.sourceLabels ?? []), ...(record.sourceLabels ?? [])])].slice(-100);
          if (current.coverageAddedAt) next.coverageAddedAt = Math.max(current.coverageAddedAt, record.coverageAddedAt ?? 0);
        }
        store.put(next);
      };
    }
    const settingsStore = transaction.objectStore("meta");
    const readSettings = settingsStore.get("settings");
    readSettings.onsuccess = () => settingsStore.put(mergeMeta(readSettings.result ?? EMPTY_META, batch.before, batch.settings), "settings");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function warning(error: unknown): string {
  return `Your latest library changes are only in memory. Export a backup before closing this tab. ${error instanceof Error && error.message.includes("blocking") ? error.message : "Browser storage is full, disabled, or unavailable."}`;
}

/** One initialization transaction migrates all legacy saves before retiring them. */
export function initializeLibrary(): Promise<void> {
  if (initialized) return initialized;
  if (typeof window === "undefined") return Promise.resolve();
  initialized = (async () => {
    const legacy: LibraryRecord[] = [];
    let legacyRaw: string | null = null;
    let legacyInvalid = false;
    try {
      legacyRaw = localStorage.getItem(LEGACY_SAVES);
      if (legacyRaw) {
        const parsed = JSON.parse(legacyRaw);
        if (parsed?.v !== 1 || !Array.isArray(parsed.items)) legacyInvalid = true;
        else for (const raw of parsed.items) {
          const item = validateLibraryItem(raw);
          if (!item) { legacyInvalid = true; continue; }
          legacy.push({ ...createLibraryRecord(item, time(raw.savedAt) ?? visitStartedAt), savedAt: time(raw.savedAt) ?? visitStartedAt });
        }
      }
    } catch { legacyInvalid = true; }
    try {
      db = await openDatabase();
      db.onversionchange = () => { db?.close(); db = null; notify(warning(new Error("Library changed in another tab. Reload to reconnect."))); };
      const loaded = await readDatabase();
      records = new Map(loaded.values.map((record) => [record.storyId, record]));
      if (loaded.settings) meta = { ...EMPTY_META, ...loaded.settings };
      recordBaselines = new Map(records);
      metaBaseline = structuredClone(meta);
      snapshot = { ...snapshot, previousVisitAt: meta.lastVisitAt };
      for (const record of legacy) records.set(record.storyId, records.has(record.storyId) ? mergeLibraryRecord(records.get(record.storyId)!, record) : record);
      const next = pruneLibraryRecords([...records.values()]);
      const retained = new Set(next.map((record) => record.storyId));
      const removed = [...records.keys()].filter((key) => !retained.has(key));
      records = new Map(next.map((record) => [record.storyId, record]));
      meta.lastVisitAt = visitStartedAt;
      await writeDatabase(writeBatch(next, removed));
      if (legacyRaw && !legacyInvalid) { try { localStorage.removeItem(LEGACY_SAVES); } catch { /* A duplicate backup is safe to keep. */ } }
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(DB_NAME);
        channel.onmessage = () => { void writes.then(async () => { if (!db || hasUnpersistedChanges) return; const revision = mutationRevision; try { const loaded = await readDatabase(); if (revision !== mutationRevision) return; records = new Map(loaded.values.map((record) => [record.storyId, record])); if (loaded.settings) meta = loaded.settings; recordBaselines = new Map(records); metaBaseline = structuredClone(meta); notify(); } catch (error) { notify(warning(error)); } }); };
      }
      snapshot = { ...snapshot, ready: true };
      notify(legacyInvalid ? "Some legacy saves could not be migrated. The original saved-data backup was retained in this browser; export the valid items before clearing site data." : null);
    } catch (error) {
      // Keep every readable legacy save available and keep the original backup.
      for (const record of legacy) records.set(record.storyId, records.has(record.storyId) ? mergeLibraryRecord(records.get(record.storyId)!, record) : record);
      snapshot = { ...snapshot, ready: true };
      notify(warning(error));
    }
  })();
  return initialized;
}

function persist(updates: readonly LibraryRecord[], removed: readonly string[] = []) {
  mutationRevision++;
  const batch = writeBatch(updates, removed);
  writes = writes.then(async () => {
    try { await writeDatabase(batch); channel?.postMessage("changed"); }
    catch (error) { hasUnpersistedChanges = true; notify(warning(error)); }
  });
}

export async function archiveItems(items: readonly FeedItem[]): Promise<void> {
  await initializeLibrary();
  const updates: LibraryRecord[] = [];
  const now = Date.now();
  for (const raw of items) {
    const item = validateLibraryItem(raw);
    if (!item) continue;
    const incoming = createLibraryRecord(item, now), old = records.get(incoming.storyId);
    // Polling the same payload must not rewrite the entire archive repeatedly.
    if (old && old.lastSeenAt > now - 300000 && JSON.stringify(old.item) === JSON.stringify(item)) continue;
    const record = old ? mergeLibraryRecord(old, incoming) : incoming;
    if (meta.readKeys[record.storyId]) record.readAt = meta.readKeys[record.storyId];
    records.set(record.storyId, record); updates.push(record);
  }
  if (!updates.length) return;
  const next = pruneLibraryRecords([...records.values()], now);
  const retained = new Set(next.map((record) => record.storyId));
  const removed = [...records.keys()].filter((key) => !retained.has(key));
  records = new Map(next.map((record) => [record.storyId, record]));
  for (const key of removed) delete meta.readKeys[key];
  notify(); persist(updates.filter((record) => retained.has(record.storyId)), removed);
}

async function updateItem(item: FeedItem, update: (record: LibraryRecord) => LibraryRecord): Promise<void> {
  await initializeLibrary();
  const valid = validateLibraryItem(item);
  if (!valid) return;
  const key = stableStoryId(valid);
  const record = update(records.get(key) ?? createLibraryRecord(valid));
  records.set(key, record);
  if (record.readAt) meta.readKeys[key] = record.readAt; else delete meta.readKeys[key];
  notify(); persist([record]);
}

export function toggleLibrarySaved(item: FeedItem): void { void updateItem(item, (record) => ({ ...record, savedAt: record.savedAt ? undefined : Date.now() })); }
export function removeLibrarySaved(storyId: string): void { void initializeLibrary().then(() => { const record = records.get(storyId); if (record) void updateItem(record.item, (current) => ({ ...current, savedAt: undefined })); }); }
export function clearLibrarySaved(): void { void initializeLibrary().then(() => { const updates = [...records.values()].filter((record) => record.savedAt).map((record) => ({ ...record, savedAt: undefined })); for (const record of updates) records.set(record.storyId, record); notify(); persist(updates); }); }
export function markRead(items: FeedItem | readonly FeedItem[], read = true): void { for (const item of Array.isArray(items) ? items : [items as FeedItem]) void updateItem(item, (record) => ({ ...record, readAt: read ? Date.now() : undefined })); }
export function setDismissed(item: FeedItem, dismissed: boolean): void { void updateItem(item, (record) => ({ ...record, dismissedAt: dismissed ? Date.now() : undefined })); }
export function toggleFollowStory(item: FeedItem): void { void updateItem(item, (record) => ({ ...record, followedAt: record.followedAt ? undefined : Date.now() })); }
export function updateLibraryItem(storyId: string, patch: { note?: string; collection?: string }): void {
  void initializeLibrary().then(() => {
    const record = records.get(storyId); if (!record) return;
    const update = { ...record, note: patch.note === undefined ? record.note : patch.note.slice(0, 10000), collection: patch.collection === undefined ? record.collection : patch.collection.trim().slice(0, 100) };
    records.set(storyId, update); notify(); persist([update]);
  });
}
export function setReadKeys(keys: readonly string[]): void {
  void initializeLibrary().then(() => { const now = Date.now(), updates: LibraryRecord[] = []; for (const key of keys) { if (key.length > 1024) continue; meta.readKeys[key] = now; const record = records.get(key); if (record) { const update = { ...record, readAt: now }; records.set(key, update); updates.push(update); } } notify(); persist(updates); });
}
export function clearLibraryRead(): void { void initializeLibrary().then(() => { meta.readKeys = {}; const updates = [...records.values()].filter((record) => record.readAt).map((record) => ({ ...record, readAt: undefined })); for (const record of updates) records.set(record.storyId, record); notify(); persist(updates); }); }
export function setFollowedTerms(terms: readonly string[]): void { void initializeLibrary().then(() => { meta.followedTerms = [...new Set(terms.map((term) => term.trim().slice(0, 100)).filter(Boolean))].slice(0, 100); notify(); persist([]); }); }
export function saveLibrarySearch(name: string, filters: LibraryFilters): void { void initializeLibrary().then(() => { const cleanName = name.trim().slice(0, 100); if (!cleanName) return; const previous = meta.savedSearches.find((search) => search.name === cleanName); if (!previous && meta.savedSearches.length >= 100) { notify("You have 100 saved searches. Remove one before saving another."); return; } const search = { id: previous?.id ?? crypto.randomUUID(), name: cleanName, filters: validateFilters(filters) }; meta.savedSearches = [...meta.savedSearches.filter((entry) => entry.id !== search.id), search]; notify(); persist([]); }); }
export function removeLibrarySearch(id: string): void { void initializeLibrary().then(() => { meta.savedSearches = meta.savedSearches.filter((search) => search.id !== id); notify(); persist([]); }); }
export function exportLibrary(): string { return serializeLibraryBackup([...records.values()], meta.savedSearches, meta.followedTerms); }
export async function importLibrary(input: string): Promise<number> {
  const parsed = parseLibraryBackup(input); // Validate the entire input before changing anything.
  await initializeLibrary();
  const imported = new Map<string, LibraryRecord>();
  for (const incoming of parsed.records) {
    const existing = imported.get(incoming.storyId) ?? records.get(incoming.storyId);
    imported.set(incoming.storyId, existing ? mergeBackupRecord(existing, incoming) : incoming);
  }
  const updates = [...imported.values()];
  for (const record of updates) records.set(record.storyId, record);
  const retained = new Map(pruneLibraryRecords([...records.values()]).map((record) => [record.storyId, record]));
  const removed = [...records.keys()].filter((key) => !retained.has(key));
  records = retained;
  meta.savedSearches = [...new Map([...meta.savedSearches, ...parsed.savedSearches].map((search) => [search.name, search])).values()].slice(0, 100);
  meta.followedTerms = [...new Set([...meta.followedTerms, ...parsed.followedTerms])].slice(0, 100);
  notify(); persist(updates.filter((record) => retained.has(record.storyId)), removed); await writes;
  return updates.length;
}
