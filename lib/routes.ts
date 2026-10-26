import { isCategoryId } from "./categories";
import type { CategoryId, ViewMode } from "./types";

/** Each view is its own route so the back button and bookmarks work. */
export const VIEW_PATHS: Record<ViewMode, string> = { brief: "/", deck: "/deck", library: "/library" };

export function viewFromPathname(pathname: string): ViewMode {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === VIEW_PATHS.deck) return "deck";
  if (path === VIEW_PATHS.library) return "library";
  return "brief";
}

/**
 * Every in-app link carries the category, so each history entry describes
 * exactly what it showed. Only a typed or bookmarked bare path falls back to
 * the stored category.
 */
export function viewHref(view: ViewMode, category: CategoryId): string {
  return `${VIEW_PATHS[view]}?cat=${category}`;
}

/** The ?cat= of a URL when it names a known category; anything else is "use the stored one". */
export function categoryFromParams(params: { get(name: string): string | null }): CategoryId | null {
  const cat = params.get("cat");
  return isCategoryId(cat) ? cat : null;
}

/** Plain left clicks navigate in place; modified clicks open a new tab and leave this one alone. */
export function isPlainClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
