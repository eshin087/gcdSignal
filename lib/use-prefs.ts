"use client";

import { useSyncExternalStore } from "react";
import { CATEGORIES } from "./categories";
import { DEFAULT_ORDER, SOURCE_IDS } from "./feeds";
import { DEFAULT_REFRESH_MS, isValidRefreshMs } from "./refresh";
import { isSortMode } from "./sort";
import type { CustomFeed, Prefs, TextScale } from "./types";

const KEY = "gcdsignal:prefs";

/** The v1-era default-hidden list, frozen for the migration path. */
const V1_DEFAULT_HIDDEN = ["fourchan", "papers"];

/** Built-ins that start hidden — full coverage is one Settings toggle away. */
const DEFAULT_HIDDEN: string[] = ["top10", "github", "papers", "fourchan", "bluesky"];

const isTextScale = (v: unknown): v is TextScale =>
  v === "sm" || v === "md" || v === "lg" || v === "xl";

export const DEFAULT_PREFS: Prefs = {
  v: 10,
  contentMode: "broad",
  followedTopics: [],
  mutedAuthors: [],
  mutedOutlets: [],
  category: "trending",
  hidden: DEFAULT_HIDDEN,
  custom: [],
  refreshMs: DEFAULT_REFRESH_MS,
  textScale: "md",
  sortMode: "signal",
  view: "brief",
  order: DEFAULT_ORDER,
  density: "comfortable",
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

export function parsePrefs(raw: string | null): Prefs {
  try {
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Omit<Partial<Prefs>, "v"> & { v?: number };
    if (typeof p?.v !== "number" || !Number.isInteger(p.v) || p.v < 1 || p.v > 10) return DEFAULT_PREFS;
    let hidden = Array.isArray(p.hidden)
      ? p.hidden.filter((x): x is string => typeof x === "string")
      : [...DEFAULT_HIDDEN];
    // v1 → hide the sources that shipped default-hidden AT THE TIME; the user's
    // own hides and custom feeds are preserved through every migration.
    if (p.v === 1) hidden = [...new Set([...hidden, ...V1_DEFAULT_HIDDEN])];
    // v2 → v3: Hacker News was hidden only by OUR v2 default (X occupied its
    // deck slot); with X gone, unhide it. Prune the removed "x" id too.
    if (p.v === 1 || p.v === 2) hidden = hidden.filter((h) => h !== "hackernews" && h !== "x");
    // v3 → v4: 4chan enters the default deck (far right), GitHub leaves.
    if (p.v <= 3) hidden = [...new Set([...hidden.filter((h) => h !== "fourchan"), "github"])];
    // v4 → v5: 4chan leaves the default deck again (Momentum takes its slot).
    if (p.v <= 4) hidden = [...new Set([...hidden, "fourchan"])];
    if (p.v < 7) hidden = [...new Set([...hidden, "top10"])];
    // v7 → v8: unreliable Bluesky search becomes opt-in. Apply this once so
    // readers can explicitly enable it again without losing that choice.
    if (p.v < 8) hidden = [...new Set([...hidden, "bluesky"])];
    // v9 → v10: keep 4chan opt-in for existing readers as well as new ones.
    // Later explicit choices are preserved; the source adapter stays available.
    if (p.v < 10) hidden = [...new Set([...hidden, "fourchan"])];
    let order = Array.isArray(p.order)
      ? p.order.filter((x): x is string => typeof x === "string")
      : DEFAULT_ORDER;
    // v8 → v9: X discoveries become a default column next to AI News. Insert
    // only the new id, preserving every existing feed's relative position.
    // Later explicit visibility and ordering choices are left untouched.
    if (p.v < 9 && !order.includes("x-discovery")) {
      order = [...order];
      order.splice(order.indexOf("rss") + 1, 0, "x-discovery");
    }
    return {
      v: 10,
      contentMode: p.v >= 7 && p.contentMode === "builder" ? "builder" : "broad",
      followedTopics: Array.isArray(p.followedTopics) ? [...new Set(p.followedTopics.filter((t) => typeof t === "string" && Object.hasOwn(CATEGORIES, t) && t !== "trending"))] : [],
      mutedAuthors: Array.isArray(p.mutedAuthors) ? p.mutedAuthors.filter((s): s is string => typeof s === "string").slice(0, 200) : [],
      mutedOutlets: Array.isArray(p.mutedOutlets) ? p.mutedOutlets.filter((s): s is string => typeof s === "string").slice(0, 200) : [],
      category: typeof p.category === "string" && Object.hasOwn(CATEGORIES, p.category) ? p.category : "trending",
      hidden,
      custom: Array.isArray(p.custom) ? p.custom.filter(isCustomFeed) : [],
      refreshMs: isValidRefreshMs(p.refreshMs) ? p.refreshMs : DEFAULT_REFRESH_MS,
      textScale: isTextScale(p.textScale) ? p.textScale : "md",
      sortMode: isSortMode(p.sortMode) ? p.sortMode : "signal",
      // The retired standalone X view opens the homepage, where its column lives.
      view: p.v >= 7 && (p.view === "deck" || p.view === "library") ? p.view : "brief",
      order,
      density: p.density === "compact" ? "compact" : "comfortable",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function load(): Prefs {
  try { return parsePrefs(localStorage.getItem(KEY)); } catch { return DEFAULT_PREFS; }
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
