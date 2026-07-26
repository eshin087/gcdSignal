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
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-indigo-500/15 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400"
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
