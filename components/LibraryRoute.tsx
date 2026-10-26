"use client";

import { useDashboard } from "./DashboardContext";
import ResearchScreen from "./ResearchScreen";

export default function LibraryRoute() {
  const { visibleFeeds, category, refreshKey, queryInput, setQueryInput } = useDashboard();
  return <ResearchScreen feeds={visibleFeeds} category={category} refreshKey={refreshKey} query={queryInput} onQueryChange={setQueryInput} />;
}
