"use client";

import ColumnDeck from "./ColumnDeck";
import { useDashboard } from "./DashboardContext";

export default function DeckRoute() {
  const { deckItems, category, refreshKey, sortMode, query, onReorder, onFocusChange } = useDashboard();
  return (
    <ColumnDeck
      items={deckItems}
      category={category}
      refreshKey={refreshKey}
      sortMode={sortMode}
      query={query}
      onReorder={onReorder}
      onFocusChange={onFocusChange}
    />
  );
}
