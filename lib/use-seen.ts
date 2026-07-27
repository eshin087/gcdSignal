"use client";

import { useSyncExternalStore } from "react";
import type { FeedItem } from "./types";

const KEY = "gcdsignal:seen";
const CAP = 3000;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FLUSH_MS = 2000;

/** Composite key — item ids are only guaranteed unique per source. */
export const seenKey = (item: Pick<FeedItem, "source" | "id">) =>
  `${item.source}:${item.id}`;

// In-memory map is the source of truth; localStorage writes are debounced.
let map: Map<string, number> | null = null;
let snapshot: ReadonlySet<string> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lifecycleHooked = false;
let listeners: Array<() => void> = [];

function readStorage(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { v?: number; items?: Record<string, number> };
    return parsed?.v === 1 && parsed.items && typeof parsed.items === "object"
      ? parsed.items
      : {};
  } catch {
    return {};
  }
}

function getMap(): Map<string, number> {
  if (map) return map;
  map = new Map<string, number>();
  const cutoff = Date.now() - TTL_MS;
  for (const [k, at] of Object.entries(readStorage())) {
    if (typeof at === "number" && at > cutoff) map.set(k, at);
  }
  return map;
}

export function getSeenSnapshot(): ReadonlySet<string> {
  return (snapshot ??= new Set(getMap().keys()));
}

function notify() {
  for (const l of listeners) l();
}

function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const m = getMap();
  const cutoff = Date.now() - TTL_MS;
  for (const [k, at] of m) if (at <= cutoff) m.delete(k);
  if (m.size > CAP) {
    const sorted = [...m.entries()].sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < m.size - CAP; i++) m.delete(sorted[i][0]);
  }
  // Cross-tab merge-on-write: keep the max seenAt per key.
  const other = readStorage();
  for (const [k, at] of Object.entries(other)) {
    if (typeof at === "number" && at > cutoff && (m.get(k) ?? 0) < at) m.set(k, at);
  }
  snapshot = null;
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, items: Object.fromEntries(m) }));
  } catch {
    // storage full/blocked — in-memory tracking still works this session
  }
}

function scheduleFlush() {
  if (!lifecycleHooked) {
    lifecycleHooked = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) flush();
    });
    window.addEventListener("pagehide", flush);
  }
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
}

export function markSeen(keys: string[]): void {
  if (!keys.length) return;
  const m = getMap();
  const now = Date.now();
  for (const k of keys) m.set(k, now);
  snapshot = null;
  scheduleFlush();
  notify();
}

export function clearSeen(): void {
  getMap().clear();
  snapshot = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  notify();
}

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

const clientCount = () => getSeenSnapshot().size;
const serverCount = () => 0;

/** Reactive seen-count for the Settings "clear history" row. */
export function useSeenCount(): number {
  return useSyncExternalStore(subscribe, clientCount, serverCount);
}
