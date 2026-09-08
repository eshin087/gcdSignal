"use client";

import { useEffect, useSyncExternalStore } from "react";
import { archiveItems, EMPTY_LIBRARY, getLibrarySnapshot, initializeLibrary, subscribeLibrary } from "./library";
import type { FeedItem } from "./types";

export * from "./library";

export function useLibrary() {
  useEffect(() => { void initializeLibrary(); }, []);
  return useSyncExternalStore(subscribeLibrary, getLibrarySnapshot, () => EMPTY_LIBRARY);
}

/** Archive the fetched pool, not just the visible or matching slice. */
export function useArchiveItems(items: readonly FeedItem[]) {
  useEffect(() => { void archiveItems(items); }, [items]);
}
