"use client";

import { useEffect, useMemo, useRef } from "react";
import { clearHealth, reportHealth } from "@/lib/feed-health";
import { timeAgo } from "@/lib/fetch-helpers";
import { SOURCE_COLORS } from "@/lib/feeds";
import { selectItems } from "@/lib/curation";
import { usePrefs } from "@/lib/use-prefs";
import { sortItems } from "@/lib/sort";
import { useCountUp } from "@/lib/use-count-up";
import { useFeed } from "@/lib/use-feed";
import { usePullToRefresh } from "@/lib/use-pull";
import { useMarkObserver, useProgressiveReveal } from "@/lib/use-reveal";
import type { CategoryId, FeedItem, SortMode, VisibleFeed } from "@/lib/types";
import { COLUMN_SHELL } from "./column-shell";
import ColumnHeader from "./ColumnHeader";
import FeedCard from "./FeedCard";
import SourceIcon from "./SourceIcon";

const MANUAL_COOLDOWN_MS = 10_000;
const PAGE = 25;
/** Past this scroll depth an auto-refresh is held behind an "N new" pill. */
const HOLD_SCROLL_PX = 80;

export default function FeedColumn({
  feed,
  category,
  refreshKey,
  sortMode,
  query,
  dragHandleProps,
  headerAction,
}: {
  feed: VisibleFeed;
  category: CategoryId;
  refreshKey: number;
  sortMode: SortMode;
  query: string;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  headerAction?: React.ReactNode;
}) {
  const { prefs, setPrefs } = usePrefs();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Custom feeds are pinned: their explicit params override the category anyway,
  // so a fixed category keeps their cache key stable across tab switches.
  const effectiveCategory = feed.isCustom ? "trending" : category;
  const {
    unseen,
    seenTail,
    status,
    error,
    stale,
    fetchedAt,
    pendingCount,
    apply,
    refetch,
    requestKey,
  } = useFeed(
    feed.source,
    feed.params,
    effectiveCategory,
    refreshKey,
    () => (scrollRef.current?.scrollTop ?? 0) > HOLD_SCROLL_PX
  );

  const cooldownRef = useRef(0);
  const manualRefresh = () => {
    if (Date.now() < cooldownRef.current || status === "loading") return;
    cooldownRef.current = Date.now() + MANUAL_COOLDOWN_MS;
    refetch(true);
  };

  const applyPending = () => {
    apply();
    scrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
  };

  // Pipeline: filter (search) → sort → reveal. Partitions never change
  // mid-view; everything below is a pure derived view of them.
  const q = query.trim().toLowerCase();
  const searching = q !== "";

  const { filteredUnseen, filteredSeen } = useMemo(() => {
    const m = (it: FeedItem) =>
      !q || `${it.title} ${it.excerpt ?? ""} ${it.sourceMeta ?? ""}`.toLowerCase().includes(q);
    return { filteredUnseen: selectItems(unseen, prefs, category, feed.isCustom).filter(m), filteredSeen: selectItems(seenTail, prefs, category, feed.isCustom).filter(m) };
  }, [unseen, seenTail, q, prefs, category, feed.isCustom]);

  const sortedUnseen = useMemo(() => sortItems(filteredUnseen, sortMode, prefs.followedTopics), [filteredUnseen, sortMode, prefs.followedTopics]);
  const sortedSeen = useMemo(() => sortItems(filteredSeen, sortMode, prefs.followedTopics), [filteredSeen, sortMode, prefs.followedTopics]);
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

  // Searching is hunting, not doomscrolling — don't mark results as seen.
  useMarkObserver(scrollRef, !searching, shownUnseen, shownSeen);

  // Mobile pull-to-refresh: down from the very top always; up past the end
  // only once the pool is exhausted, so it never fights the reveal sentinel.
  const { pull, handlers: pullHandlers } = usePullToRefresh(scrollRef, manualRefresh, showAll);

  // Report into the status bar's health store.
  const poolSize = unseen.length + seenTail.length;
  const health = status === "ok" ? (stale ? "stale" : "ok") : status;
  useEffect(() => {
    reportHealth(feed.id, { status: health, count: poolSize, fetchedAt: fetchedAt ?? undefined });
  }, [feed.id, health, poolSize, fetchedAt]);
  useEffect(() => () => clearHealth(feed.id), [feed.id]);

  const badgeValue = useCountUp(sortedUnseen.length);
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

      <ColumnHeader icon={<SourceIcon source={feed.source} />} label={feed.label} health={health}
        title={feed.isCustom ? `${feed.label} · custom feed` : feed.label}
        count={status === "ok" ? badgeValue : undefined}
        countTitle={searching ? `${total} matches` : `${unseen.length} new · ${poolSize} total`}
        onRefresh={manualRefresh} refreshing={status === "loading"} extraAction={headerAction} dragHandleProps={dragHandleProps} />

      {status === "ok" && stale && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-500/20 bg-amber-500/[0.07] px-3 py-1.5 font-mono text-[10px] leading-tight text-amber-700 dark:border-amber-400/15 dark:text-amber-300/90">
          <span>cached results — updated {fetchedAt ? timeAgo(fetchedAt) : "earlier"}</span>
          <button
            onClick={() => refetch(true)}
            className="shrink-0 font-semibold underline-offset-2 hover:underline"
          >
            retry
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        {...pullHandlers}
        className="feed-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {pendingCount > 0 && (
          <div className="pointer-events-none sticky top-2 z-10 flex justify-center">
            <button
              onClick={applyPending}
              className="card-enter pointer-events-auto rounded-full bg-cyan-500 px-3 py-1 font-mono text-[11px] font-semibold text-white shadow-lg shadow-cyan-500/30 transition-colors hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 dark:bg-cyan-400 dark:text-cyan-950 dark:hover:bg-cyan-300"
            >
              ↑ {pendingCount} new
            </button>
          </div>
        )}

        {pull?.dir === "top" && (
          <div className="py-2.5 text-center font-mono text-[10px] font-medium text-cyan-600 md:hidden dark:text-cyan-300">
            {pull.armed ? "release to refresh ↻" : "pull down to refresh ↓"}
          </div>
        )}

        {status === "loading" && <ColumnSkeleton label={feed.label} />}

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

        {status === "ok" && total < 5 && prefs.contentMode === "builder" && !feed.isCustom && !searching && <div className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">Fewer builder matches here. <button className="action-button" onClick={() => setPrefs((p) => ({ ...p, contentMode: "broad" }))}>Explore Broad</button></div>}
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
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
              seen
            </span>
            <span className="h-px flex-1 bg-black/[0.06] dark:bg-white/[0.06]" />
          </div>
        )}

        {status === "ok" && shownSeen.map((item) => <FeedCard key={item.id} item={item} />)}

        {status === "ok" && !showAll && <div ref={sentinelRef} className="h-px" />}

        {status === "ok" && total > 0 && showAll && !searching && (
          <div className="py-3 text-center font-mono text-[10px] text-zinc-400 md:hidden dark:text-zinc-600">
            {pull?.dir === "bottom" && pull.armed ? "release to refresh ↻" : "pull up to refresh"}
          </div>
        )}
      </div>
    </section>
  );
}

/** Terminal-style loading: a sync line with a blinking cursor, then shimmer rows. */
export function ColumnSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4 p-3" aria-label="Loading">
      <p className="font-mono text-[11px] text-cyan-600/90 dark:text-cyan-400/90">
        <span className="text-zinc-400 dark:text-zinc-600">▸ </span>
        syncing {label.toLowerCase()}
        <span className="cursor-blink">▍</span>
      </p>
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
