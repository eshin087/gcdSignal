"use client";

import { useEffect, useSyncExternalStore } from "react";

export const READING_QUEUE_KEY = "gcdsignal:reading-queue:v1";
export const READING_QUEUE_LIMIT = 200;
export const READING_QUEUE_BACKUP_LIMIT = 2 * 1024 * 1024;
const READING_QUEUE_ID_LIMIT = 512;
const READING_QUEUE_TITLE_LIMIT = 500;
const READING_QUEUE_SOURCE_LIMIT = 100;
const READING_QUEUE_URL_LIMIT = 4096;
export interface ReadingQueueEntry { id: string; title: string; url: string; source: string }
export interface ReadingQueueItem extends ReadingQueueEntry { addedAt: number }
export interface ReadingQueueSnapshot { items: readonly ReadingQueueItem[]; warning: string | null; ready: boolean }
export interface ReadingQueueExport { data: string; recovery: boolean }
export const EMPTY_READING_QUEUE: ReadingQueueSnapshot = { items: [], warning: null, ready: false };
type QueueStorage = Pick<Storage, "getItem" | "setItem">;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value.trim() || null;
}

/** Backups contain display text and outbound links only, never executable markup. */
export function validateReadingQueueEntry(value: unknown): ReadingQueueEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id, READING_QUEUE_ID_LIMIT), title = text(row.title, READING_QUEUE_TITLE_LIMIT), source = text(row.source, READING_QUEUE_SOURCE_LIMIT), rawUrl = text(row.url, READING_QUEUE_URL_LIMIT);
  if (!id || !title || !source || !rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || !url.hostname) return null;
    const normalizedUrl = text(url.href, READING_QUEUE_URL_LIMIT);
    return normalizedUrl ? { id, title, source, url: normalizedUrl } : null;
  } catch { return null; }
}

function backupSize(raw: string): number {
  return new TextEncoder().encode(raw).byteLength;
}

function urlKey(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.href;
}

/** Existing entries win; adding the same story never moves it to the back. */
export function mergeReadingQueueItems(existing: readonly ReadingQueueItem[], incoming: readonly ReadingQueueItem[]): ReadingQueueItem[] {
  const ids = new Set<string>(), urls = new Set<string>();
  return [...existing, ...incoming].filter((item) => {
    const key = urlKey(item.url);
    if (ids.has(item.id) || urls.has(key)) return false;
    ids.add(item.id); urls.add(key); return true;
  }).sort((a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id));
}

export function parseReadingQueueBackup(raw: string): ReadingQueueItem[] {
  if (typeof raw !== "string" || backupSize(raw) > READING_QUEUE_BACKUP_LIMIT) throw new Error("Choose a queue backup smaller than 2 MB.");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("This is not a valid queue backup. Nothing was changed."); }
  if (!value || typeof value !== "object") throw new Error("This is not a valid queue backup. Nothing was changed.");
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== 1 || !Array.isArray(data.items) || data.items.length > READING_QUEUE_LIMIT) throw new Error("Use a version 1 Must read backup with at most 200 items.");
  const items = data.items.map((row: unknown) => {
    const entry = validateReadingQueueEntry(row);
    const addedAt = row && typeof row === "object" ? (row as Record<string, unknown>).addedAt : undefined;
    if (!entry || typeof addedAt !== "number" || !Number.isFinite(addedAt) || addedAt < 0 || addedAt > 8.64e15) throw new Error("The backup contains an invalid item. Nothing was changed.");
    return { ...entry, addedAt };
  });
  return mergeReadingQueueItems([], items);
}

export function serializeReadingQueue(items: readonly ReadingQueueItem[], recovery = false): string {
  const raw = JSON.stringify({ schemaVersion: 1, ...(recovery ? { recoveryScope: "visible-items-in-this-tab-only" } : {}), items }, null, 2);
  if (backupSize(raw) > READING_QUEUE_BACKUP_LIMIT) throw new Error("This queue is too large for a round-trip-safe 2 MB backup.");
  return raw;
}

/** A separate, synchronous local store; queue actions never alter Library saves. */
export function createReadingQueueStore(getStorage: () => QueueStorage | null) {
  let snapshot = EMPTY_READING_QUEUE;
  const listeners = new Set<() => void>();
  let additions: ReadingQueueItem[] = [];
  const removedIds = new Set<string>(), removedUrls = new Set<string>();
  const publish = (items: readonly ReadingQueueItem[], warning: string | null) => {
    snapshot = { items, warning, ready: true };
    listeners.forEach((listener) => listener());
  };
  const read = () => {
    const storage = getStorage();
    if (!storage) throw new Error("Storage unavailable");
    const raw = storage.getItem(READING_QUEUE_KEY);
    return { storage, items: raw === null ? [] : parseReadingQueueBackup(raw) };
  };
  const applyPending = (base: readonly ReadingQueueItem[]) => mergeReadingQueueItems(
    base.filter((item) => !removedIds.has(item.id) && !removedUrls.has(urlKey(item.url))), additions,
  );
  const unreadableWarning = "Your previous queue could not be read and has not been overwritten. Changes stay in this tab only. Export a recovery backup of the visible items, or retry storage.";
  const unsavedWarning = "Your queue changes are kept in this tab but could not be saved. Export a backup before closing the tab, or retry storage.";
  const persist = () => {
    let current: ReturnType<typeof read>;
    try { current = read(); }
    catch { publish(snapshot.items, unreadableWarning); return false; }
    const items = applyPending(current.items);
    if (items.length > READING_QUEUE_LIMIT) {
      publish(snapshot.items, "The stored queue and this tab exceed 200 items. Export a backup, then finish some items before retrying storage.");
      return false;
    }
    try { current.storage.setItem(READING_QUEUE_KEY, serializeReadingQueue(items)); }
    catch {
      publish(snapshot.items, unsavedWarning);
      return false;
    }
    additions = []; removedIds.clear(); removedUrls.clear();
    publish(items, null); return true;
  };
  const initialize = () => {
    if (snapshot.ready) return;
    try { publish(read().items, null); } catch { publish([], unreadableWarning); }
  };
  const refresh = () => {
    initialize();
    try {
      const items = applyPending(read().items);
      if (items.length > READING_QUEUE_LIMIT) {
        publish(snapshot.items, "The stored queue and this tab exceed 200 items. Export a backup, then finish some items before retrying storage.");
        return false;
      }
      const pending = additions.length > 0 || removedIds.size > 0 || removedUrls.size > 0;
      // A successful read clears stale read/capacity warnings. Keep a warning
      // only while this tab still has changes that have not reached storage.
      publish(items, pending ? unsavedWarning : null);
      return true;
    } catch {
      // Never make a stale in-memory snapshot look current after a failed read.
      publish(snapshot.items, unreadableWarning);
      return false;
    }
  };
  const exportSnapshot = (): ReadingQueueExport => {
    initialize();
    const recovery = !refresh();
    return { data: serializeReadingQueue(snapshot.items, recovery), recovery };
  };
  return {
    initialize,
    refresh,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    add(value: ReadingQueueEntry) {
      const entry = validateReadingQueueEntry(value);
      if (!entry) return false;
      refresh();
      if (snapshot.items.some((item) => item.id === entry.id || urlKey(item.url) === urlKey(entry.url))) return true;
      if (snapshot.items.length >= READING_QUEUE_LIMIT) {
        publish(snapshot.items, "Your queue has 200 items. Finish a few before adding more; nothing was removed."); return false;
      }
      const item = { ...entry, addedAt: Date.now() };
      removedIds.delete(item.id); removedUrls.delete(urlKey(item.url));
      additions = mergeReadingQueueItems(additions, [item]);
      publish(mergeReadingQueueItems(snapshot.items, [item]), snapshot.warning);
      persist(); return true;
    },
    remove(id: string) {
      refresh();
      const item = snapshot.items.find((item) => item.id === id);
      if (!item) return false;
      removedIds.add(item.id); removedUrls.add(urlKey(item.url));
      additions = additions.filter((pending) => pending.id !== item.id && urlKey(pending.url) !== urlKey(item.url));
      publish(snapshot.items.filter((item) => item.id !== id), snapshot.warning);
      persist(); return true;
    },
    import(raw: string): { ok: boolean; added: number; error?: string } {
      let incoming: ReadingQueueItem[];
      try { incoming = parseReadingQueueBackup(raw); }
      catch (error) { return { ok: false, added: 0, error: error instanceof Error ? error.message : "Could not read this backup." }; }
      refresh();
      const combined = mergeReadingQueueItems(snapshot.items, incoming);
      if (combined.length > READING_QUEUE_LIMIT) return { ok: false, added: 0, error: "Import would exceed 200 queued items. Finish some items first; nothing was changed." };
      const fresh = combined.filter((item) => !snapshot.items.some((current) => current.id === item.id || urlKey(current.url) === urlKey(item.url)));
      fresh.forEach((item) => { removedIds.delete(item.id); removedUrls.delete(urlKey(item.url)); });
      additions = mergeReadingQueueItems(additions, fresh);
      publish(combined, snapshot.warning); persist();
      return { ok: true, added: fresh.length };
    },
    retry: () => { initialize(); return persist(); },
    export: () => exportSnapshot().data,
    exportWithStatus: exportSnapshot,
  };
}

const store = createReadingQueueStore(() => typeof window === "undefined" ? null : window.localStorage);
let storageHookUsers = 0;
const onStorage = (event: StorageEvent) => {
  if (event.storageArea === window.localStorage && (event.key === READING_QUEUE_KEY || event.key === null)) store.refresh();
};
function subscribeStorageEvents() {
  storageHookUsers += 1;
  if (storageHookUsers === 1) window.addEventListener("storage", onStorage);
  return () => {
    storageHookUsers -= 1;
    if (storageHookUsers === 0) window.removeEventListener("storage", onStorage);
  };
}
export const addToReadingQueue = store.add;
export const removeFromReadingQueue = store.remove;
export const importReadingQueue = store.import;
export const exportReadingQueue = store.exportWithStatus;
export const retryReadingQueueStorage = store.retry;
export function useReadingQueue() {
  useEffect(() => { store.initialize(); return subscribeStorageEvents(); }, []);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY_READING_QUEUE);
}
