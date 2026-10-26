"use client";

import type { CategoryId, ViewMode } from "@/lib/types";
import CategoryTabs from "./CategoryTabs";
import { BookmarkIcon, GearIcon, SearchIcon } from "./icons";

export default function Header({
  category, onCategoryChange, view, onViewChange, queryInput, onQueryInputChange,
  onOpenSettings, settingsOpen, onOpenQueue, queueOpen, queueCount,
}: {
  category: CategoryId; onCategoryChange: (category: CategoryId) => void;
  view: ViewMode; onViewChange: (view: ViewMode) => void;
  queryInput: string; onQueryInputChange: (query: string) => void;
  onOpenSettings: () => void; settingsOpen: boolean;
  onOpenQueue: () => void; queueOpen: boolean; queueCount: number;
}) {
  return <header className="reader-header relative z-30 w-full min-w-0 max-w-full shrink-0 overflow-hidden border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#111214]">
    <div className="mx-auto flex max-w-[1600px] items-center gap-x-2 px-3 py-2 max-[359px]:gap-x-1 sm:gap-x-4 sm:px-6">
      <button className="min-h-11 min-w-11 shrink-0 text-xl font-semibold tracking-tight" onClick={() => { onQueryInputChange(""); onViewChange("brief"); }} aria-label="Signal home">
        <span className="hidden sm:inline">gcd</span><span className="text-teal-700 max-[359px]:hidden dark:text-teal-300">signal</span><span aria-hidden="true" className="hidden text-2xl text-teal-700 max-[359px]:inline dark:text-teal-300">s</span>
      </button>
      <nav aria-label="Main navigation" className="flex items-center gap-0.5 max-[359px]:gap-0">
        {(["brief", "deck", "library"] as const).map((destination) => <button key={destination} className="reader-nav" aria-current={view === destination ? "page" : undefined} onClick={() => { onQueryInputChange(""); onViewChange(destination); }}>
          {destination === "brief" ? "Brief" : destination === "deck" ? "Deck" : "Library"}
        </button>)}
      </nav>
      {/* On phones the Library screen carries its own search field; the header
          keeps the first row to logo, navigation and two icons. */}
      <label className="ml-auto hidden min-h-11 w-72 items-center gap-2 rounded-xl border border-transparent bg-zinc-100 px-3 focus-within:border-teal-600 md:flex dark:bg-zinc-800/70">
        <SearchIcon className="h-4 w-4 shrink-0 text-zinc-500" />
        <input type="search" placeholder="Search your collection…" aria-label="Search your collection" value={queryInput}
          onChange={(e) => { onQueryInputChange(e.target.value); if (e.target.value) onViewChange("library"); }}
          onKeyDown={(e) => { if (e.key === "Escape") onQueryInputChange(""); }}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>
      <button className="reader-icon relative ml-auto flex shrink-0 items-center justify-center text-zinc-700 md:ml-0 dark:text-zinc-200"
        aria-label={`Must read queue${queueCount ? `, ${queueCount} items` : ""}`} title="Must read queue" aria-haspopup="dialog" aria-expanded={queueOpen} onClick={onOpenQueue}>
        <BookmarkIcon className="h-5 w-5" filled={queueCount > 0} />
        {queueCount > 0 && <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-teal-700 px-1 text-center text-[10px] font-semibold leading-4 text-white dark:bg-teal-500 dark:text-zinc-950">{queueCount > 99 ? "99+" : queueCount}</span>}
      </button>
      <button className="settings-trigger flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-zinc-300 px-3 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        aria-label="Settings" title="Settings" aria-haspopup="dialog" aria-expanded={settingsOpen} onClick={onOpenSettings}>
        <GearIcon className="h-5 w-5" /><span className="hidden text-sm font-medium lg:inline">Settings</span>
      </button>
    </div>
    {(view === "brief" || view === "deck") && <div className="mx-auto w-full min-w-0 max-w-[1600px] px-3 pb-1 sm:px-6"><CategoryTabs category={category} onChange={onCategoryChange} /></div>}
  </header>;
}
