"use client";

import { useState } from "react";
import { useSavedKeys } from "@/lib/use-saved";
import type { CategoryId, Density, SortMode, TextScale, ViewMode } from "@/lib/types";
import CategoryTabs from "./CategoryTabs";
import DisplayControl from "./DisplayControl";
import {
  BookmarkIcon,
  ColumnsIcon,
  GearIcon,
  MailIcon,
  SearchIcon,
  StreamIcon,
  XIcon,
} from "./icons";
import RefreshControl from "./RefreshControl";
import SortControl from "./SortControl";
import ThemeToggle from "./ThemeToggle";

const ICON_BTN =
  "rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-black/[0.05] hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 dark:hover:bg-white/[0.06] dark:hover:text-zinc-300";

const INPUT_CLS =
  "rounded-lg border border-black/10 bg-black/[0.02] px-2.5 py-1 text-xs outline-none placeholder:text-zinc-400 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20 dark:border-white/15 dark:bg-white/[0.03] dark:placeholder:text-zinc-600";

export default function Header({
  category,
  onCategoryChange,
  lastRefreshAt,
  onRefresh,
  refreshMs,
  onRefreshMsChange,
  view,
  onViewChange,
  sortMode,
  onSortModeChange,
  textScale,
  onTextScaleChange,
  density,
  onDensityChange,
  queryInput,
  onQueryInputChange,
  onOpenSettings,
  onOpenNewsletter,
  onOpenSaved,
}: {
  category: CategoryId;
  onCategoryChange: (c: CategoryId) => void;
  lastRefreshAt: number | null;
  onRefresh: () => void;
  refreshMs: number;
  onRefreshMsChange: (ms: number) => void;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  sortMode: SortMode;
  onSortModeChange: (m: SortMode) => void;
  textScale: TextScale;
  onTextScaleChange: (t: TextScale) => void;
  density: Density;
  onDensityChange: (d: Density) => void;
  queryInput: string;
  onQueryInputChange: (q: string) => void;
  onOpenSettings: () => void;
  onOpenNewsletter: () => void;
  onOpenSaved: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const savedCount = useSavedKeys().size;

  const clearSearch = () => {
    onQueryInputChange("");
    setSearchOpen(false);
  };

  return (
    <header className="relative z-30 shrink-0 border-b border-black/[0.06] bg-white/65 backdrop-blur-xl dark:border-white/[0.07] dark:bg-[#0a0a0b]/60">
      <div className="flex h-12 items-center gap-3 px-3 md:px-4">
        <h1 className="shrink-0 text-[15px] font-bold tracking-tight">
          gcd
          <span className="text-cyan-600 dark:bg-gradient-to-r dark:from-cyan-400 dark:to-sky-400 dark:bg-clip-text dark:text-transparent">
            signal
          </span>
        </h1>

        {/* View toggle */}
        <div className="flex shrink-0 items-center rounded-lg border border-black/10 p-0.5 dark:border-white/10">
          <button
            onClick={() => onViewChange("deck")}
            aria-pressed={view === "deck"}
            title="Deck view"
            className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors ${
              view === "deck"
                ? "bg-cyan-500/[0.12] text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-300"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            <ColumnsIcon className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Deck</span>
          </button>
          <button
            onClick={() => onViewChange("foryou")}
            aria-pressed={view === "foryou"}
            title="For You feed"
            className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors ${
              view === "foryou"
                ? "bg-cyan-500/[0.12] text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-300"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            <StreamIcon className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">For You</span>
          </button>
        </div>

        <div className="hidden min-w-0 md:block">
          <CategoryTabs category={category} onChange={onCategoryChange} />
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          {/* Search: inline at lg+, icon below */}
          <input
            type="search"
            value={queryInput}
            onChange={(e) => onQueryInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onQueryInputChange("");
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="Search feeds…"
            className={`hidden w-36 transition-all focus:w-52 lg:block ${INPUT_CLS}`}
          />
          <button
            onClick={() => setSearchOpen((o) => !o)}
            aria-label="Search"
            aria-expanded={searchOpen}
            className={`lg:hidden ${ICON_BTN} ${queryInput ? "text-cyan-600 dark:text-cyan-300" : ""}`}
          >
            <SearchIcon />
          </button>

          <span className="mx-1 hidden h-4 w-px bg-black/10 sm:block dark:bg-white/10" />

          <SortControl sortMode={sortMode} onChange={onSortModeChange} />
          <DisplayControl
            textScale={textScale}
            onTextScaleChange={onTextScaleChange}
            density={density}
            onDensityChange={onDensityChange}
          />
          <RefreshControl
            lastRefreshAt={lastRefreshAt}
            onRefresh={onRefresh}
            refreshMs={refreshMs}
            onRefreshMsChange={onRefreshMsChange}
          />

          <span className="mx-1 hidden h-4 w-px bg-black/10 sm:block dark:bg-white/10" />

          <button
            onClick={onOpenSaved}
            aria-label="Saved items"
            title="Saved items"
            className={`relative ${ICON_BTN}`}
          >
            <BookmarkIcon className="h-4 w-4" />
            {savedCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-cyan-500 px-0.5 text-[9px] font-bold text-white dark:bg-cyan-400 dark:text-cyan-950">
                {savedCount > 99 ? "99+" : savedCount}
              </span>
            )}
          </button>
          <ThemeToggle />
          <button
            onClick={onOpenNewsletter}
            title="Daily email digest"
            className={`flex items-center gap-1.5 ${ICON_BTN}`}
          >
            <MailIcon className="h-4 w-4" />
            <span className="hidden text-xs font-medium xl:inline">Subscribe</span>
          </button>
          <button onClick={onOpenSettings} aria-label="Feed settings" title="Feeds" className={ICON_BTN}>
            <GearIcon />
          </button>
        </div>
      </div>

      {/* Expanded search row (below lg) — also opens when a query arrives from
          elsewhere (momentum topic tap) so the active filter stays visible. */}
      {(searchOpen || queryInput !== "") && (
        <div className="flex items-center gap-2 px-3 pb-2 lg:hidden">
          <input
            type="search"
            autoFocus
            value={queryInput}
            onChange={(e) => onQueryInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") clearSearch();
            }}
            placeholder="Search all feeds…"
            className={`w-full ${INPUT_CLS}`}
          />
          <button onClick={clearSearch} aria-label="Close search" className={ICON_BTN}>
            <XIcon />
          </button>
        </div>
      )}

      <div className="px-2 pb-2 md:hidden">
        <CategoryTabs category={category} onChange={onCategoryChange} />
      </div>
    </header>
  );
}
