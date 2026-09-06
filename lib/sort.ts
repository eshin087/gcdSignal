import type { FeedItem, SortMode } from "./types";

export const SORT_OPTIONS: Array<{ id: SortMode; label: string; desc: string }> = [
  { id: "hot", label: "Hot", desc: "Source ranking" },
  { id: "new", label: "New", desc: "Most recent first" },
  { id: "top", label: "Top", desc: "Highest votes / views" },
  { id: "discussed", label: "Discussed", desc: "Most comments first" },
];

export function isSortMode(v: unknown): v is SortMode {
  return v === "hot" || v === "new" || v === "top" || v === "discussed";
}

/**
 * Client-side re-sort of a fetched pool. Items without the sorted metric keep
 * their relative order at the END (partition-then-sort — a `?? -Infinity`
 * comparator would compare undefineds).
 */
export function sortItems(items: FeedItem[], mode: SortMode): FeedItem[] {
  if (mode === "hot") return items;
  if (mode === "new") {
    return [...items].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  }
  const field = mode === "top" ? ("score" as const) : ("comments" as const);
  const withVal = items.filter((i) => typeof i[field] === "number");
  const without = items.filter((i) => typeof i[field] !== "number");
  return [
    ...withVal.sort((a, b) => (b[field] as number) - (a[field] as number)),
    ...without,
  ];
}
