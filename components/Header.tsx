"use client";

import type { CategoryId } from "@/lib/types";
import CategoryTabs from "./CategoryTabs";
import { GearIcon, MailIcon } from "./icons";
import RefreshControl from "./RefreshControl";
import ThemeToggle from "./ThemeToggle";

const ICON_BTN =
  "rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-black/[0.05] hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 dark:hover:bg-white/[0.06] dark:hover:text-zinc-300";

export default function Header({
  category,
  onCategoryChange,
  lastRefreshAt,
  onRefresh,
  refreshMs,
  onRefreshMsChange,
  onOpenSettings,
  onOpenNewsletter,
}: {
  category: CategoryId;
  onCategoryChange: (c: CategoryId) => void;
  lastRefreshAt: number | null;
  onRefresh: () => void;
  refreshMs: number;
  onRefreshMsChange: (ms: number) => void;
  onOpenSettings: () => void;
  onOpenNewsletter: () => void;
}) {
  return (
    <header className="relative z-30 shrink-0 border-b border-black/[0.06] bg-white/65 backdrop-blur-xl dark:border-white/[0.07] dark:bg-[#0a0a0b]/60">
      <div className="flex h-12 items-center gap-4 px-3 md:px-4">
        <h1 className="text-[15px] font-bold tracking-tight">
          gcd
          <span className="text-cyan-600 dark:bg-gradient-to-r dark:from-cyan-400 dark:to-sky-400 dark:bg-clip-text dark:text-transparent">
            signal
          </span>
        </h1>

        <div className="hidden min-w-0 md:block">
          <CategoryTabs category={category} onChange={onCategoryChange} />
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          <RefreshControl
            lastRefreshAt={lastRefreshAt}
            onRefresh={onRefresh}
            refreshMs={refreshMs}
            onRefreshMsChange={onRefreshMsChange}
          />
          <ThemeToggle />
          <button
            onClick={onOpenNewsletter}
            title="Daily email digest"
            className={`flex items-center gap-1.5 ${ICON_BTN}`}
          >
            <MailIcon className="h-4 w-4" />
            <span className="hidden text-xs font-medium sm:inline">Subscribe</span>
          </button>
          <button onClick={onOpenSettings} aria-label="Feed settings" title="Feeds" className={ICON_BTN}>
            <GearIcon />
          </button>
        </div>
      </div>

      <div className="px-2 pb-2 md:hidden">
        <CategoryTabs category={category} onChange={onCategoryChange} />
      </div>
    </header>
  );
}
