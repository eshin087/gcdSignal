"use client";

import { useMemo, useRef } from "react";
import { timeAgo } from "@/lib/fetch-helpers";
import { SOURCE_COLORS } from "@/lib/feeds";
import { sortItems } from "@/lib/sort";
import { useFeed } from "@/lib/use-feed";
import { usePullToRefresh } from "@/lib/use-pull";
import { useMarkObserver, useProgressiveReveal } from "@/lib/use-reveal";
import type { CategoryId, FeedItem, SortMode, VisibleFeed } from "@/lib/types";
import { COLUMN_HEADER, COLUMN_SHELL } from "./column-shell";
import FeedCard from "./FeedCard";
import { RefreshIcon } from "./icons";
import SourceIcon from "./SourceIcon";

const MANUAL_COOLDOWN_MS = 10_000;
const PAGE = 25;

export default function FeedColumn({
  feed,
  category,
  refreshKey,
  sortMode,
  query,
  dragHandleProps,
}: {
  feed: VisibleFeed;
  category: CategoryId;
  refreshKey: number;
  sortMode: SortMode;
  query: string;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
}) {
  // Custom feeds are pinned: their explicit params override the category anyway,
  // so a fixed category keeps their cache key stable across tab switches.
  const effectiveCategory = feed.isCustom ? "trending" : category;
  const { unseen, seenTail, status, error, stale, fetchedAt, refetch, requestKey } = useFeed(
    feed.source,
    feed.params,
    effectiveCategory,
    refreshKey
  );

  const cooldownRef = useRef(0);
  const manualRefresh = () => {
    if (Date.now() < cooldownRef.current || status === "loading") return;
    cooldownRef.current = Date.now() + MANUAL_COOLDOWN_MS;
    refetch(true);
  };

  // Pipeline: filter (search) → sort → reveal. Partitions never change
  // mid-view; everything below is a pure derived view of them.
  const q = query.trim().toLowerCase();
  const searching = q !== "";

  const { filteredUnseen, filteredSeen } = useMemo(() => {
    if (!q) return { filteredUnseen: unseen, filteredSeen: seenTail };
    const m = (it: FeedItem) =>
      `${it.title} ${it.excerpt ?? ""} ${it.sourceMeta ?? ""}`.toLowerCase().includes(q);
    return { filteredUnseen: unseen.filter(m), filteredSeen: seenTail.filter(m) };
  }, [unseen, seenTail, q]);

  const sortedUnseen = useMemo(() => sortItems(filteredUnseen, sortMode), [filteredUnseen, sortMode]);
  const sortedSeen = useMemo(() => sortItems(filteredSeen, sortMode), [filteredSeen, sortMode]);
  const total = sortedUnseen.length + sortedSeen.length;

  const { revealed, fullyRevealed, sentinelRef } = useProgressiveReveal(requestKey, total, PAGE);
  // Search results are small — show them all, no windowing.
  const shownCount = searching ? total : revealed;
  const showAll = searching || fullyRevealed;

  const { shownUnseen, shownSeen } = useMemo(
    () => ({
      shownUnseen: sortedUnseen.slice(0, Math.min(shownCount, sortedUnseen.length)),
      shownSeen:
        shownCount > sortedUnseen.length
          ? sortedSeen.slice(0, shownCount - sortedUnseen.length)
          : [],
    }),
    [sortedUnseen, sortedSeen, shownCount]
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  // Searching is hunting, not doomscrolling — don't mark results as seen.
  useMarkObserver(scrollRef, !searching, shownUnseen, shownSeen);

  // Mobile pull-to-refresh: down from the very top always; up past the end
  // only once the pool is exhausted, so it never fights the reveal sentinel.
  const { pull, handlers: pullHandlers } = usePullToRefresh(scrollRef, manualRefresh, showAll);

  const color = SOURCE_COLORS[feed.source];
  const networkBlocked = error !== null && /\b(403|429|blocked|rate limited)\b/i.test(error);

  return (
    <section className={COLUMN_SHELL}>
      {/* Per-source accent strip */}
      <div
        aria-hidden
        className="h-[2px] shrink-0"
        style={{
          background: `linear-gradient(90deg, color-mix(in srgb, ${color} 60%, transparent), color-mix(in srgb, ${color} 8%, transparent) 70%, transparent)`,
        }}
      />

      <header
        {...dragHandleProps}
        className={`${COLUMN_HEADER} ${dragHandleProps ? "select-none md:cursor-grab md:active:cursor-grabbing" : ""}`}
      >
        <SourceIcon source={feed.source} />
        <h2 className="truncate text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
          {feed.label}
        </h2>
        {feed.isCustom && (
          <span className="rounded bg-black/[0.05] px-1 py-px text-[10px] text-zinc-500 dark:bg-white/[0.07]">
            custom
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {status === "ok" && (
            <span
              className="rounded-full bg-black/[0.04] px-1.5 py-px text-[10px] tabular-nums text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400"
              title={searching ? `${total} matches` : `${unseen.length} new · ${unseen.length + seenTail.length} total`}
            >
              {searching ? total : unseen.length}
            </span>
          )}
          <button
            onClick={manualRefresh}
            aria-label={`Refresh ${feed.label}`}
            title={`Refresh ${feed.label}`}
            draggable={false}
            className="rounded p-1 text-zinc-400 transition-colors hover:bg-black/[0.05] hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 dark:text-zinc-600 dark:hover:bg-white/[0.06] dark:hover:text-zinc-300"
          >
            <RefreshIcon className={`h-3 w-3 ${status === "loading" ? "animate-spin" : ""}`} />
          </button>
        </span>
      </header>

      {status === "ok" && stale && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-500/20 bg-amber-500/[0.07] px-3 py-1.5 text-[10px] leading-tight text-amber-700 dark:border-amber-400/15 dark:text-amber-300/90">
          <span>Live fetch failed — cached {fetchedAt ? timeAgo(fetchedAt) : "earlier"}</span>
          <button
            onClick={() => refetch(true)}
            className="shrink-0 font-semibold underline-offset-2 hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        {...pullHandlers}
        className="feed-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {pull?.dir === "top" && (
          <div className="py-2.5 text-center text-[10px] font-medium text-cyan-600 md:hidden dark:text-cyan-300">
            {pull.armed ? "Release to refresh ↻" : "Pull down to refresh ↓"}
          </div>
        )}

        {status === "loading" && <ColumnSkeleton />}

        {status === "error" && (
          <div className="mx-3 my-4 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-3 text-xs leading-relaxed text-red-700 dark:border-red-400/20 dark:text-red-300/90">
            <p className="mb-1 font-medium">
              {networkBlocked
                ? `${feed.label} is temporarily unavailable (blocked or rate-limited upstream).`
                : "Couldn't load this feed."}
            </p>
            <p className="break-all font-mono text-[10px] opacity-60">{error}</p>
            <button
              onClick={() => refetch(true)}
              className="mt-2 rounded-md border border-black/10 px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-cyan-500/50 hover:text-cyan-600 dark:border-white/15 dark:text-zinc-300 dark:hover:border-cyan-400/50 dark:hover:text-cyan-300"
            >
              Retry
            </button>
          </div>
        )}

        {status === "ok" && total === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-xs text-zinc-500">
              {searching ? "No matches in this feed." : "Nothing matching right now."}
            </p>
            {!searching && (
              <p className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-600">
                Try another category or refresh.
              </p>
            )}
          </div>
        )}

        {status === "ok" && !searching && total > 0 && sortedUnseen.length === 0 && (
          <div className="px-4 pb-1 pt-4 text-center">
            <p className="text-xs font-medium text-cyan-700 dark:text-cyan-300">
              You&apos;re all caught up ✓
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-600">
              Everything below has been seen before.
            </p>
          </div>
        )}

        {status === "ok" && shownUnseen.map((item) => <FeedCard key={item.id} item={item} />)}

        {status === "ok" && shownUnseen.length > 0 && shownSeen.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2" aria-label="Previously seen items">
            <span className="h-px flex-1 bg-black/[0.06] dark:bg-white/[0.06]" />
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
              seen
            </span>
            <span className="h-px flex-1 bg-black/[0.06] dark:bg-white/[0.06]" />
          </div>
        )}

        {status === "ok" && shownSeen.map((item) => <FeedCard key={item.id} item={item} />)}

        {status === "ok" && !showAll && <div ref={sentinelRef} className="h-px" />}

        {status === "ok" && total > 0 && showAll && !searching && (
          <div className="py-3 text-center text-[10px] text-zinc-400 md:hidden dark:text-zinc-600">
            {pull?.dir === "bottom" && pull.armed ? "Release to refresh ↻" : "Pull up to refresh"}
          </div>
        )}
      </div>
    </section>
  );
}

function ColumnSkeleton() {
  return (
    <div className="space-y-4 p-3" aria-label="Loading">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-3/4" />
          <div className="skeleton h-2.5 w-1/3" />
        </div>
      ))}
    </div>
  );
}
