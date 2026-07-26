"use client";

import { useFeed } from "@/lib/use-feed";
import type { CategoryId } from "@/lib/types";
import FeedCard from "./FeedCard";
import SourceIcon from "./SourceIcon";
import type { VisibleFeed } from "./Dashboard";

export default function FeedColumn({
  feed,
  category,
  refreshKey,
}: {
  feed: VisibleFeed;
  category: CategoryId;
  refreshKey: number;
}) {
  // Custom feeds are pinned: their explicit params override the category anyway,
  // so a fixed category keeps their cache key stable across tab switches.
  const effectiveCategory = feed.isCustom ? "trending" : category;
  const { items, status, error, refetch } = useFeed(
    feed.source,
    feed.params,
    effectiveCategory,
    refreshKey
  );

  return (
    <section
      data-feed-id={feed.id}
      className="flex min-h-0 w-[88vw] max-w-[380px] flex-none snap-center flex-col border-r border-black/[0.07] bg-white first:border-l md:w-[340px] md:rounded-lg md:border md:border-black/[0.07] dark:border-white/[0.07] dark:bg-[#121214] dark:md:border-white/[0.07]"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-black/[0.07] px-3 dark:border-white/[0.07]">
        <SourceIcon source={feed.source} />
        <h2 className="truncate text-xs font-semibold tracking-wide">{feed.label}</h2>
        {feed.isCustom && (
          <span className="rounded bg-black/[0.05] px-1 py-px text-[10px] text-zinc-500 dark:bg-white/[0.07]">
            custom
          </span>
        )}
        {status === "ok" && (
          <span className="ml-auto text-[10px] tabular-nums text-zinc-400 dark:text-zinc-600">
            {items.length}
          </span>
        )}
      </header>

      <div className="feed-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {status === "loading" && <ColumnSkeleton />}

        {status === "error" && (
          <div className="flex flex-col items-start gap-2 px-4 py-6 text-xs text-zinc-500">
            <p className="leading-relaxed">Couldn&apos;t load this feed.</p>
            <p className="break-all font-mono text-[10px] text-zinc-400 dark:text-zinc-600">{error}</p>
            <button
              onClick={refetch}
              className="rounded border border-black/10 px-2 py-1 text-[11px] font-medium hover:border-indigo-500/50 hover:text-indigo-600 dark:border-white/15 dark:hover:text-indigo-400"
            >
              Retry
            </button>
          </div>
        )}

        {status === "ok" && items.length === 0 && (
          <p className="px-4 py-6 text-xs text-zinc-500">Nothing matching here right now.</p>
        )}

        {status === "ok" && items.map((item) => <FeedCard key={item.id} item={item} />)}
      </div>
    </section>
  );
}

function ColumnSkeleton() {
  return (
    <div className="space-y-4 p-3" aria-label="Loading">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="skeleton space-y-1.5" style={{ animationDelay: `${i * 120}ms` }}>
          <div className="h-3 w-full rounded bg-zinc-300/60 dark:bg-zinc-700/50" />
          <div className="h-3 w-3/4 rounded bg-zinc-300/60 dark:bg-zinc-700/50" />
          <div className="h-2.5 w-1/3 rounded bg-zinc-200/60 dark:bg-zinc-800/60" />
        </div>
      ))}
    </div>
  );
}
