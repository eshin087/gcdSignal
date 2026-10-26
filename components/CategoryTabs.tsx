"use client";

import Link from "next/link";
import { CATEGORIES, CATEGORY_IDS } from "@/lib/categories";
import { isPlainClick, viewHref } from "@/lib/routes";
import type { CategoryId, ViewMode } from "@/lib/types";

export default function CategoryTabs({
  view,
  category,
  onChange,
}: {
  view: ViewMode;
  category: CategoryId;
  /** A tab was clicked; the link itself moves the URL to ?cat=<id>. */
  onChange: (c: CategoryId) => void;
}) {
  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label="AI category">
      {CATEGORY_IDS.map((id) => {
        const active = id === category;
        return (
          <Link
            key={id}
            href={viewHref(view, id)}
            scroll={false}
            onClick={(e) => { if (isPlainClick(e)) onChange(id); }}
            onNavigate={(e) => { if (active) e.preventDefault(); }}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full px-3 py-1 text-[length:var(--fs-ui)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 ${
              active
                ? "bg-cyan-500/[0.12] text-cyan-700 ring-1 ring-inset ring-cyan-500/25 dark:bg-cyan-400/10 dark:text-cyan-300 dark:ring-cyan-400/20"
                : "text-zinc-500 hover:bg-black/[0.05] hover:text-zinc-700 dark:hover:bg-white/[0.06] dark:hover:text-zinc-300"
            }`}
          >
            {CATEGORIES[id].label}
          </Link>
        );
      })}
    </nav>
  );
}
