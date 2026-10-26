"use client";

import { useDashboard } from "./DashboardContext";
import HomeColumns from "./HomeColumns";

export default function BriefRoute() {
  const { category, refreshKey, showX, onFocusChange } = useDashboard();
  return <HomeColumns category={category} refreshKey={refreshKey} showX={showX} onFocusChange={onFocusChange} />;
}
