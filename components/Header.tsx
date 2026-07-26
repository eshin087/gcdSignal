"use client";

import type { CategoryId } from "@/lib/types";
import CategoryTabs from "./CategoryTabs";
import { GearIcon, MailIcon } from "./icons";
import RefreshControl from "./RefreshControl";
import ThemeToggle from "./ThemeToggle";

export default function Header({
  category,
  onCategoryChange,
  lastRefreshAt,
  onRefresh,
  onOpenSettings,
  onOpenNewsletter,
}: {
  category: CategoryId;
  onCategoryChange: (c: CategoryId) => void;
  lastRefreshAt: number | null;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onOpenNewsletter: () => void;
}) {
  return (
    <header className="shrink-0 border-b border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#0a0a0a]">
      <div className="flex h-12 items-center gap-4 px-3 md:px-4">
        <h1 className="text-sm font-semibold tracking-tight">
          gcd<span className="text-indigo-500 dark:text-indigo-400">signal</span>
        </h1>

        <div className="hidden min-w-0 md:block">
          <CategoryTabs category={category} onChange={onCategoryChange} />
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          <RefreshControl lastRefreshAt={lastRefreshAt} onRefresh={onRefresh} />
          <ThemeToggle />
          <button
            onClick={onOpenNewsletter}
            title="Daily email digest"
            className="flex items-center gap-1.5 rounded p-1.5 text-zinc-500 transition-colors hover:bg-black/[0.05] hover:text-zinc-700 dark:hover:bg-white/[0.06] dark:hover:text-zinc-300"
          >
            <MailIcon className="h-4 w-4" />
            <span className="hidden text-xs font-medium sm:inline">Subscribe</span>
          </button>
          <button
            onClick={onOpenSettings}
            aria-label="Feed settings"
            title="Feeds"
            className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-black/[0.05] hover:text-zinc-700 dark:hover:bg-white/[0.06] dark:hover:text-zinc-300"
          >
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
