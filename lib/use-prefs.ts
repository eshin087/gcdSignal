"use client";

import { useSyncExternalStore } from "react";
import { CATEGORIES } from "./categories";
import { SOURCE_IDS } from "./feeds";
import { DEFAULT_REFRESH_MS, isValidRefreshMs } from "./refresh";
import type { CustomFeed, Prefs } from "./types";

const KEY = "gcdsignal:prefs";

/** Built-ins that start hidden — full coverage is one Settings toggle away. */
const DEFAULT_HIDDEN: string[] = ["fourchan", "papers"];

export const DEFAULT_PREFS: Prefs = {
  v: 3,
  category: "trending",
  hidden: DEFAULT_HIDDEN,
  custom: [],
  refreshMs: DEFAULT_REFRESH_MS,
};

function isCustomFeed(x: unknown): x is CustomFeed {
  if (typeof x !== "object" || x === null) return false;
  const f = x as Record<string, unknown>;
  return (
    typeof f.id === "string" &&
    typeof f.label === "string" &&
    typeof f.source === "string" &&
    (SOURCE_IDS as string[]).includes(f.source) &&
    typeof f.params === "object" &&
    f.params !== null &&
    Object.values(f.params).every((v) => typeof v === "string")
  );
}

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Omit<Partial<Prefs>, "v"> & { v?: number };
    if (p?.v !== 1 && p?.v !== 2 && p?.v !== 3) return DEFAULT_PREFS;
    let hidden = Array.isArray(p.hidden)
      ? p.hidden.filter((x): x is string => typeof x === "string")
      : [];
    // v1 → hide the sources that ship default-hidden; the user's own hides and
    // custom feeds are preserved through every migration.
    if (p.v === 1) hidden = [...new Set([...hidden, ...DEFAULT_HIDDEN])];
    // v2 → v3: Hacker News was hidden only by OUR v2 default (X occupied its
    // deck slot); with X gone, unhide it. Prune the removed "x" id too.
    if (p.v === 1 || p.v === 2) hidden = hidden.filter((h) => h !== "hackernews" && h !== "x");
    return {
      v: 3,
      category: typeof p.category === "string" && p.category in CATEGORIES ? p.category : "trending",
      hidden,
      custom: Array.isArray(p.custom) ? p.custom.filter(isCustomFeed) : [],
      refreshMs: isValidRefreshMs(p.refreshMs) ? p.refreshMs : DEFAULT_REFRESH_MS,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

// localStorage-backed external store. The cache keeps getSnapshot referentially
// stable between writes, which useSyncExternalStore requires.
let cache: Prefs | null = null;
let listeners: Array<() => void> = [];

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

const getSnapshot = (): Prefs => (cache ??= load());
const getServerSnapshot = (): Prefs => DEFAULT_PREFS;

export function updatePrefs(update: (p: Prefs) => Prefs) {
  cache = update(getSnapshot());
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // storage full/blocked — keep in-memory state
  }
  for (const l of listeners) l();
}

const clientReady = () => true;
const serverReady = () => false;

/**
 * Hydration-safe prefs: the server (and first client render) sees defaults with
 * ready=false; the real localStorage snapshot swaps in right after hydration.
 */
export function usePrefs() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  return { prefs, setPrefs: updatePrefs, ready };
}
