import type { FeedItem, SortMode } from "./types";
import type { CategoryId } from "./types";
import { authorKey, classify, outletKey } from "./curation";

export const SORT_OPTIONS: Array<{ id: SortMode; label: string; desc: string }> = [
  { id: "signal", label: "Signal", desc: "Your topics, freshness & useful discoveries" },
  { id: "hot", label: "Hot", desc: "Source ranking" },
  { id: "new", label: "New", desc: "Most recent first" },
  { id: "top", label: "Top", desc: "Highest votes / views" },
  { id: "discussed", label: "Discussed", desc: "Most comments first" },
];

export function isSortMode(v: unknown): v is SortMode {
  return v === "signal" || v === "hot" || v === "new" || v === "top" || v === "discussed";
}

/**
 * Client-side re-sort of a fetched pool. Items without the sorted metric keep
 * their relative order at the END (partition-then-sort — a `?? -Infinity`
 * comparator would compare undefineds).
 */
export function sortItems(items: FeedItem[], mode: SortMode, followed: CategoryId[] = [], now = Date.now()): FeedItem[] {
  if (mode === "signal") return rankSignal(items, followed, now);
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

/** Missing values are neutral. Equal engagement values share their midrank. */
export function engagementPercentiles(items: FeedItem[]): Map<FeedItem, number> {
  const result = new Map<FeedItem, number>();
  for (const source of new Set(items.map((it) => it.source))) {
    const group = items.filter((it) => it.source === source);
    const value = (it: FeedItem) => Math.max(0, it.score ?? 0) + 2 * Math.max(0, it.comments ?? 0);
    const measured = group.filter((it) => typeof it.score === "number" || typeof it.comments === "number").sort((a, b) => value(a) - value(b));
    for (const item of group) result.set(item, 0.5);
    for (let i = 0; i < measured.length;) {
      let end = i + 1;
      while (end < measured.length && value(measured[end]) === value(measured[i])) end++;
      const pct = measured.length < 2 ? 0.5 : (i + end - 1) / 2 / (measured.length - 1);
      for (let j = i; j < end; j++) result.set(measured[j], pct);
      i = end;
    }
  }
  return result;
}

export function rankSignal(items: FeedItem[], followed: CategoryId[], now: number): FeedItem[] {
  const pcts = engagementPercentiles(items);
  const score = (it: FeedItem) => {
    const meta = it.curation ?? classify(it);
    const age = Number.isFinite(Date.parse(it.timestamp)) ? Math.max(0, (now - Date.parse(it.timestamp)) / 3600000) : 168;
    return 0.35 * Math.pow(0.5, age / 24) + 0.25 * (pcts.get(it) ?? 0.5)
      + 0.2 * Number(meta.builder) + 0.2 * Number(meta.topics.some((t) => followed.includes(t)));
  };
  const scores = new Map(items.map((it) => [it, score(it)]));
  const outlets = new Map(items.map((it) => [it, outletKey(it)]));
  const authors = new Map(items.map((it) => [it, authorKey(it)]));
  const remaining = [...items].sort((a, b) => scores.get(b)! - scores.get(a)! || a.id.localeCompare(b.id));
  const out: FeedItem[] = [];
  // Greedy diversity: no more than two from an outlet/author in a rolling five,
  // unless the available pool makes that impossible.
  while (remaining.length) {
    const recent = out.slice(-4);
    let i = remaining.findIndex((it) => recent.filter((r) => outlets.get(r) === outlets.get(it)).length < 2
      && (!authors.get(it) || recent.filter((r) => authors.get(r) === authors.get(it)).length < 2));
    if (i < 0) i = 0;
    out.push(...remaining.splice(i, 1));
  }
  return out;
}
