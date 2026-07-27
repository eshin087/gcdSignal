"use client";

import { useSyncExternalStore } from "react";
import { seenKey } from "./use-seen";
import type { FeedItem } from "./types";

const KEY = "gcdsignal:saved";
const CAP = 500;

export interface SavedItem extends FeedItem {
  savedAt: number;
}

// Full items are stored (not just keys) so saves survive feed rotation.
let items: SavedItem[] | null = null;
let keysSnapshot: ReadonlySet<string> | null = null;
let listeners: Array<() => void> = [];

const EMPTY_ITEMS: ReadonlyArray<SavedItem> = Object.freeze([]);
const EMPTY_KEYS: ReadonlySet<string> = new Set();

function isSavedItem(x: unknown): x is SavedItem {
  if (typeof x !== "object" || x === null) return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.source === "string" &&
    typeof s.title === "string" &&
    typeof s.url === "string" &&
    typeof s.timestamp === "string" &&
    typeof s.savedAt === "number"
  );
}

function load(): SavedItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as { v?: number; items?: unknown[] };
    if (p?.v !== 1 || !Array.isArray(p.items)) return [];
    return p.items.filter(isSavedItem);
  } catch {
    return [];
  }
}

function getItems(): SavedItem[] {
  return (items ??= load());
}

function persistAndNotify() {
  keysSnapshot = null;
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, items: getItems() }));
  } catch {
    // storage full/blocked — in-memory state still works this session
  }
  for (const l of listeners) l();
}

export function toggleSaved(item: FeedItem): void {
  const key = seenKey(item);
  const list = getItems().filter((s) => seenKey(s) !== key);
  if (list.length === getItems().length) {
    // Wasn't saved — add it.
    list.push({ ...item, savedAt: Date.now() });
    if (list.length > CAP) {
      list.sort((a, b) => a.savedAt - b.savedAt);
      list.splice(0, list.length - CAP);
    }
  }
  items = list;
  persistAndNotify();
}

export function clearSaved(): void {
  items = [];
  keysSnapshot = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

const getItemsSnap = (): ReadonlyArray<SavedItem> => getItems();
const getKeysSnap = (): ReadonlySet<string> =>
  (keysSnapshot ??= new Set(getItems().map((s) => seenKey(s))));

export function useSavedItems(): ReadonlyArray<SavedItem> {
  return useSyncExternalStore(subscribe, getItemsSnap, () => EMPTY_ITEMS);
}

export function useSavedKeys(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getKeysSnap, () => EMPTY_KEYS);
}
