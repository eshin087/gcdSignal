"use client";

import { useSyncExternalStore } from "react";
import { CATEGORIES } from "./categories";
import { SOURCE_IDS } from "./feeds";
import { DEFAULT_REFRESH_MS, isValidRefreshMs } from "./refresh";
import { isSortMode } from "./sort";
import type { CustomFeed, Prefs } from "./types";

const KEY = "gcdsignal:prefs";

/** The v1-era default-hidden list, frozen for the migration path. */
const V1_DEFAULT_HIDDEN = ["fourchan", "papers"];

/** Built-ins that start hidden — full coverage is one Settings toggle away. */
const DEFAULT_HIDDEN: string[] = ["github", "papers"];

export const DEFAULT_PREFS: Prefs = {
  v: 4,
  category: "trending",
  hidden: DEFAULT_HIDDEN,
  custom: [],
  refreshMs: DEFAULT_REFRESH_MS,
  textScale: "md",
  sortMode: "hot",
  view: "deck",
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
    if (p?.v !== 1 && p?.v !== 2 && p?.v !== 3 && p?.v !== 4) return DEFAULT_PREFS;
    let hidden = Array.isArray(p.hidden)
      ? p.hidden.filter((x): x is string => typeof x === "string")
      : [];
    // v1 → hide the sources that shipped default-hidden AT THE TIME; the user's
    // own hides and custom feeds are preserved through every migration.
    if (p.v === 1) hidden = [...new Set([...hidden, ...V1_DEFAULT_HIDDEN])];
    // v2 → v3: Hacker News was hidden only by OUR v2 default (X occupied its
    // deck slot); with X gone, unhide it. Prune the removed "x" id too.
    if (p.v === 1 || p.v === 2) hidden = hidden.filter((h) => h !== "hackernews" && h !== "x");
    // v3 → v4: 4chan enters the default deck (far right), GitHub leaves.
    if (p.v <= 3) hidden = [...new Set([...hidden.filter((h) => h !== "fourchan"), "github"])];
    return {
      v: 4,
      category: typeof p.category === "string" && p.category in CATEGORIES ? p.category : "trending",
      hidden,
      custom: Array.isArray(p.custom) ? p.custom.filter(isCustomFeed) : [],
      refreshMs: isValidRefreshMs(p.refreshMs) ? p.refreshMs : DEFAULT_REFRESH_MS,
      textScale: p.textScale === "sm" || p.textScale === "lg" ? p.textScale : "md",
      sortMode: isSortMode(p.sortMode) ? p.sortMode : "hot",
      view: p.view === "foryou" ? "foryou" : "deck",
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
