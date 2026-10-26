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
            className="reader-chip shrink-0 text-[length:var(--fs-ui)] transition-colors"
          >
            {CATEGORIES[id].label}
          </button>
        );
      })}
    </nav>
  );
}
