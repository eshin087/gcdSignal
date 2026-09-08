"use client";

import { useState } from "react";
import type { CategoryId, Density, SortMode, TextScale, ViewMode } from "@/lib/types";
import CategoryTabs from "./CategoryTabs";
import CurationControls from "./CurationControls";
import DisplayControl from "./DisplayControl";
import RefreshControl from "./RefreshControl";
import SortControl from "./SortControl";
import ThemeToggle from "./ThemeToggle";
import { GearIcon } from "./icons";

export default function Header({
  category, onCategoryChange, lastRefreshAt, onRefresh, refreshMs, onRefreshMsChange,
  view, onViewChange, sortMode, onSortModeChange, textScale, onTextScaleChange,
  density, onDensityChange, queryInput, onQueryInputChange, onOpenSettings, onOpenX,
}: {
  category: CategoryId; onCategoryChange: (c: CategoryId) => void;
  lastRefreshAt: number | null; onRefresh: () => void; refreshMs: number; onRefreshMsChange: (n: number) => void;
  view: ViewMode; onViewChange: (v: ViewMode) => void;
  sortMode: SortMode; onSortModeChange: (m: SortMode) => void;
  textScale: TextScale; onTextScaleChange: (s: TextScale) => void;
  density: Density; onDensityChange: (d: Density) => void;
  queryInput: string; onQueryInputChange: (q: string) => void;
  onOpenSettings: () => void; onOpenX: () => void;
}) {
  const [more, setMore] = useState(false);
  return <header className="reader-header relative z-30 shrink-0 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#111214]">
    <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 px-3 py-2 sm:px-6">
      <button className="min-h-11 shrink-0 text-xl font-semibold tracking-tight" onClick={() => { onQueryInputChange(""); onViewChange("brief"); }} aria-label="Signal home">
        gcd<span className="text-teal-700 dark:text-teal-300">signal</span>
      </button>
      <nav aria-label="Main navigation" className="flex items-center gap-1">
        {(["brief", "deck", "library"] as const).map((v) => <button key={v} className="reader-nav" aria-current={view === v ? "page" : undefined} onClick={() => { onQueryInputChange(""); onViewChange(v); }}>
          {v === "brief" ? "Brief" : v === "deck" ? "Deck" : "Library"}
        </button>)}
      </nav>
      <button className="reader-icon ml-auto md:order-last" aria-label="More controls" aria-expanded={more} onClick={() => setMore(!more)}>•••</button>
      <label className="order-last flex min-h-11 w-full items-center gap-2 rounded-lg bg-zinc-100 px-3 md:order-none md:ml-auto md:w-72 dark:bg-zinc-800/70">
        <span className="sr-only">Search your collection</span>
        <span aria-hidden className="text-zinc-500">⌕</span>
        <input type="search" placeholder="Search your collection…" aria-label="Search your collection" value={queryInput}
          onChange={(e) => { onQueryInputChange(e.target.value); if (e.target.value) onViewChange("library"); }}
          onKeyDown={(e) => { if (e.key === "Escape") onQueryInputChange(""); }}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>
    </div>
    {view !== "library" && <div className="mx-auto max-w-[1600px] px-3 pb-1 sm:px-6"><CategoryTabs category={category} onChange={onCategoryChange} /></div>}
    {more && <div className="reader-controls max-h-[65dvh] overflow-y-auto border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-[#111214]" onKeyDown={(e) => { if (e.key === "Escape") setMore(false); }}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
        {view === "deck" && <SortControl sortMode={sortMode} onChange={onSortModeChange} />}
        <DisplayControl textScale={textScale} onTextScaleChange={onTextScaleChange} density={density} onDensityChange={onDensityChange} />
        <RefreshControl lastRefreshAt={lastRefreshAt} onRefresh={onRefresh} refreshMs={refreshMs} onRefreshMsChange={onRefreshMsChange} />
        <ThemeToggle />
        <button className="action-button" onClick={onOpenSettings} aria-label="Feed settings"><GearIcon className="h-4 w-4" /> Sources</button>
        <button className="action-button" onClick={onOpenX}>X reading panel</button>
      </div>
      <div className="mx-auto max-w-5xl"><CurationControls /></div>
    </div>}
  </header>;
}
