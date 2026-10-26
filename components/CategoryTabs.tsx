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
            className="reader-chip shrink-0 text-[length:var(--fs-ui)] transition-colors"
          >
            {CATEGORIES[id].label}
          </Link>
        );
      })}
    </nav>
  );
}
