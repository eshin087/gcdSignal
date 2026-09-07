"use client";

import { useMemo } from "react";
import { useForYou } from "@/lib/use-foryou";
import type { CategoryId, VisibleFeed } from "@/lib/types";
import LibraryView from "./LibraryView";

export default function ResearchScreen({ feeds, category, refreshKey, query, onQueryChange }: {
  feeds: VisibleFeed[]; category: CategoryId; refreshKey: number; query: string; onQueryChange: (q: string) => void;
}) {
  const { perSource, failures, status } = useForYou(feeds, category, refreshKey);
  const items = useMemo(() => perSource.flatMap((s) => [...s.unseen, ...s.seenTail]), [perSource]);
  return <div className="flex min-h-0 flex-1 flex-col">
    {status === "loading" && <p role="status" className="shrink-0 px-4 py-2 text-xs text-zinc-600 dark:text-zinc-400">Updating your collection. Saved items are available below.</p>}
    {!!failures.length && <p role="status" className="shrink-0 px-4 py-2 text-xs text-amber-800 dark:text-amber-300">Some sources are unavailable: {failures.map((f) => f.label).join(", ")}. Your existing collection remains searchable.</p>}
    <div className="feed-scroll min-h-0 flex-1 overflow-y-auto"><LibraryView query={query} onQueryChange={onQueryChange} items={items} /></div>
  </div>;
}
