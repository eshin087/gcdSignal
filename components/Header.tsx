"use client";

import type { CategoryId, ViewMode } from "@/lib/types";
import CategoryTabs from "./CategoryTabs";
import { GearIcon } from "./icons";

export default function Header({
  category, onCategoryChange, view, onViewChange, queryInput, onQueryInputChange,
  onOpenSettings, settingsOpen,
}: {
  category: CategoryId; onCategoryChange: (category: CategoryId) => void;
  view: ViewMode; onViewChange: (view: ViewMode) => void;
  queryInput: string; onQueryInputChange: (query: string) => void;
  onOpenSettings: () => void; settingsOpen: boolean;
}) {
  return <header className="reader-header relative z-30 shrink-0 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#111214]">
    <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 max-[359px]:gap-x-1 sm:gap-x-4 sm:px-6">
      <button className="min-h-11 min-w-11 shrink-0 text-xl font-semibold tracking-tight" onClick={() => { onQueryInputChange(""); onViewChange("brief"); }} aria-label="Signal home">
        <span className="hidden sm:inline">gcd</span><span className="text-teal-700 max-[359px]:hidden dark:text-teal-300">signal</span><span aria-hidden="true" className="hidden text-2xl text-teal-700 max-[359px]:inline dark:text-teal-300">s</span>
      </button>
      <nav aria-label="Main navigation" className="flex items-center gap-0.5 max-[359px]:gap-0">
        {(["brief", "deck", "library", "x"] as const).map((destination) => <button key={destination} className="reader-nav" aria-current={view === destination ? "page" : undefined} onClick={() => { onQueryInputChange(""); onViewChange(destination); }}>
          {destination === "brief" ? "Brief" : destination === "deck" ? "Deck" : destination === "library" ? "Library" : "X"}
        </button>)}
      </nav>
      <label className="order-last flex min-h-11 w-full items-center gap-2 rounded-xl border border-transparent bg-zinc-100 px-3 focus-within:border-teal-600 md:order-none md:ml-auto md:w-72 dark:bg-zinc-800/70">
        <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
        <input type="search" placeholder="Search your collection…" aria-label="Search your collection" value={queryInput}
          onChange={(e) => { onQueryInputChange(e.target.value); if (e.target.value) onViewChange("library"); }}
          onKeyDown={(e) => { if (e.key === "Escape") onQueryInputChange(""); }}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>
      <button className="settings-trigger ml-auto flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-zinc-300 px-3 text-zinc-700 hover:bg-zinc-100 md:ml-0 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        aria-label="Settings" title="Settings" aria-haspopup="dialog" aria-expanded={settingsOpen} onClick={onOpenSettings}>
        <GearIcon className="h-5 w-5" /><span className="hidden text-sm font-medium lg:inline">Settings</span>
      </button>
    </div>
    {(view === "brief" || view === "deck") && <div className="mx-auto max-w-[1600px] px-3 pb-1 sm:px-6"><CategoryTabs category={category} onChange={onCategoryChange} /></div>}
  </header>;
}
