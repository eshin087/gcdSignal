"use client";

import { useMemo } from "react";
import { clearLibrarySaved, removeLibrarySaved, toggleLibrarySaved, useLibrary } from "./use-library";
import { stableStoryId } from "./stories";
import type { FeedItem } from "./types";
import type { LibraryRecord } from "./library";

export interface SavedItem extends FeedItem { savedAt: number }
const keyCache = new WeakMap<readonly LibraryRecord[], ReadonlySet<string>>();

export const toggleSaved = toggleLibrarySaved;
export const clearSaved = clearLibrarySaved;
export function removeSaved(item: FeedItem | string): void { removeLibrarySaved(typeof item === "string" ? item : stableStoryId(item)); }

/** Compatibility layer: existing card saves now use the durable local library. */
export function useSavedItems(): ReadonlyArray<SavedItem> {
  const { records } = useLibrary();
  return useMemo(() => records.filter((record) => record.savedAt).map((record) => ({ ...record.item, savedAt: record.savedAt! })).sort((a, b) => b.savedAt - a.savedAt), [records]);
}

export function useSavedKeys(): ReadonlySet<string> {
  const { records } = useLibrary();
  // Hundreds of deck cards share one derived set instead of each scanning 5,000 records.
  let keys = keyCache.get(records);
  if (!keys) { keys = new Set(records.filter((record) => record.savedAt).map((record) => record.storyId)); keyCache.set(records, keys); }
  return keys;
}
