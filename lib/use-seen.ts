"use client";

import { stableStoryId } from "./stories";
import { clearLibraryRead, getLibrarySnapshot, setReadKeys, useLibrary } from "./use-library";
import type { FeedItem } from "./types";

/** Story identity survives a new discussion ID or tracking URL for the same article. */
export const seenKey = (item: Pick<FeedItem, "source" | "id" | "url" | "externalUrl" | "title">) => stableStoryId(item);
export const getSeenSnapshot = (): ReadonlySet<string> => getLibrarySnapshot().readKeys;
/** Explicit actions only. Legacy viewport-based seen history is deliberately not imported as read. */
export const markSeen = setReadKeys;
export const clearSeen = clearLibraryRead;
export function useSeenCount(): number { return useLibrary().readKeys.size; }
