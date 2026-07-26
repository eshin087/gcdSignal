"use client";

import { CATEGORIES, CATEGORY_IDS } from "@/lib/categories";
import type { CategoryId } from "@/lib/types";

export default function CategoryTabs({
  category,
  onChange,
}: {
  category: CategoryId;
  onChange: (c: CategoryId) => void;
}) {
  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label="AI category">
      {CATEGORY_IDS.map((id) => {
        const active = id === category;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            aria-pressed={active}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 ${
              active
                ? "bg-cyan-500/[0.12] text-cyan-700 ring-1 ring-inset ring-cyan-500/25 dark:bg-cyan-400/10 dark:text-cyan-300 dark:ring-cyan-400/20"
                : "text-zinc-500 hover:bg-black/[0.05] hover:text-zinc-700 dark:hover:bg-white/[0.06] dark:hover:text-zinc-300"
            }`}
          >
            {CATEGORIES[id].label}
          </button>
        );
      })}
    </nav>
  );
}
