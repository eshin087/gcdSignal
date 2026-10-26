"use client";

import { createContext, useContext } from "react";
import type { CategoryId, DeckItem, SortMode, VisibleFeed } from "@/lib/types";

/** What a route's view needs from the persistent reader shell. */
export interface DashboardState {
  category: CategoryId;
  refreshKey: number;
  /** Raw header search text; the Library filters as you type. */
  queryInput: string;
  /** Debounced search text for Deck columns. */
  query: string;
  setQueryInput: (value: string) => void;
  showX: boolean;
  deckItems: DeckItem[];
  visibleFeeds: VisibleFeed[];
  sortMode: SortMode;
  onReorder: (dragId: string, targetId: string, side: "before" | "after") => void;
  onFocusChange: (focused: boolean) => void;
}

export const DashboardContext = createContext<DashboardState | null>(null);

export function useDashboard(): DashboardState {
  const state = useContext(DashboardContext);
  if (!state) throw new Error("useDashboard must render inside the reader shell");
  return state;
}
