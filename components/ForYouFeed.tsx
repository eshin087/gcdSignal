"use client";

import { useMemo, useRef } from "react";
import { sortItems } from "@/lib/sort";
import { useForYou } from "@/lib/use-foryou";
import { usePullToRefresh } from "@/lib/use-pull";
import { useMarkObserver, useProgressiveReveal } from "@/lib/use-reveal";
import type { CategoryId, FeedItem, SortMode, VisibleFeed } from "@/lib/types";
import FeedCard from "./FeedCard";

const PAGE = 30;
const MANUAL_COOLDOWN_MS = 10_000;

/** Round-robin drain preserving each list's internal order. */
function roundRobin(lists: FeedItem[][]): FeedItem[] {
  const out: FeedItem[] = [];
  for (let round = 0; ; round++) {
    let added = false;
    for (const list of lists) {
      if (list[round]) {
        out.push(list[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

export default function ForYouFeed({
  feeds,
  category,
  refreshKey,
  sortMode,
  query,
}: {
  feeds: VisibleFeed[];
  category: CategoryId;
  refreshKey: number;
  sortMode: SortMode;
  query: string;
}) {
  const { perSource, failures, staleLabels, status, refetch, requestKey } = useForYou(
    feeds,
    category,
    refreshKey
  );

  const cooldownRef = useRef(0);
  const manualRefresh = () => {
    if (Date.now() < cooldownRef.current || status === "loading") return;
    cooldownRef.current = Date.now() + MANUAL_COOLDOWN_MS;
    refetch(true);
  };

  const q = query.trim().toLowerCase();
  const searching = q !== "";

  const { unseenMix, seenMix } = useMemo(() => {
    const m = (it: FeedItem) =>
      !q || `${it.title} ${it.excerpt ?? ""} ${it.sourceMeta ?? ""}`.toLowerCase().includes(q);
    // Cross-source scores are incomparable (reddit votes vs youtube views), so
    // hot/top/discussed rank per source then round-robin by deck order. "New"
    // uses real timestamps, which ARE comparable — sort globally post-merge.
    const perMode = sortMode === "new" ? "hot" : sortMode;
    const uLists = perSource.map((s) => sortItems(s.unseen.filter(m), perMode));
    const sLists = perSource.map((s) => sortItems(s.seenTail.filter(m), perMode));
    let u = roundRobin(uLists);
    let sn = roundRobin(sLists);
    if (sortMode === "new") {
      const byTime = (a: FeedItem, b: FeedItem) =>
        Date.parse(b.timestamp) - Date.parse(a.timestamp);
      u = [...u].sort(byTime);
      sn = [...sn].sort(byTime);
    }
    return { unseenMix: u, seenMix: sn };
  }, [perSource, sortMode, q]);

  const total = unseenMix.length + seenMix.length;
  const { revealed, fullyRevealed, sentinelRef } = useProgressiveReveal(requestKey, total, PAGE);
  const shownCount = searching ? total : revealed;
  const showAll = searching || fullyRevealed;

  const { shownUnseen, shownSeen } = useMemo(
    () => ({
      shownUnseen: unseenMix.slice(0, Math.min(shownCount, unseenMix.length)),
      shownSeen:
        shownCount > unseenMix.length ? seenMix.slice(0, shownCount - unseenMix.length) : [],
    }),
    [unseenMix, seenMix, shownCount]
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  useMarkObserver(scrollRef, !searching, shownUnseen, shownSeen);
  const { pull, handlers: pullHandlers } = usePullToRefresh(scrollRef, manualRefresh, showAll);

  return (
    <div
      ref={scrollRef}
      {...pullHandlers}
      className="feed-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div className="foryou-scale mx-auto w-full max-w-2xl md:px-4 md:py-3">
        {pull?.dir === "top" && (
          <div className="py-2.5 text-center text-[10px] font-medium text-cyan-600 md:hidden dark:text-cyan-300">
            {pull.armed ? "Release to refresh ↻" : "Pull down to refresh ↓"}
          </div>
        )}

        <div className="overflow-hidden bg-white md:rounded-xl md:border md:border-black/[0.07] dark:bg-[#111114]/80 dark:md:border-white/[0.07]">
          {status === "loading" && (
            <div className="space-y-4 p-4" aria-label="Loading">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="skeleton h-3 w-full" />
                  <div className="skeleton h-3 w-3/4" />
                  <div className="skeleton h-2.5 w-1/3" />
                </div>
              ))}
            </div>
          )}

          {status === "error" && (
            <div className="m-4 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-3 text-xs leading-relaxed text-red-700 dark:border-red-400/20 dark:text-red-300/90">
              <p className="mb-1 font-medium">Couldn&apos;t load any feeds.</p>
              <p className="break-all font-mono text-[10px] opacity-60">
                {failures[0]?.message}
              </p>
            </div>
          )}

          {status === "ok" && failures.length > 0 && (
            <p className="border-b border-black/[0.05] px-4 py-2 text-[11px] text-zinc-400 dark:border-white/[0.05] dark:text-zinc-600">
              Unavailable right now: {failures.map((f) => f.label).join(", ")}
            </p>
          )}

          {status === "ok" && staleLabels.length > 0 && (
            <p className="border-b border-amber-500/15 bg-amber-500/[0.06] px-4 py-2 text-[11px] text-amber-700 dark:text-amber-300/90">
              Showing cached results for: {staleLabels.join(", ")}
            </p>
          )}

          {status === "ok" && total === 0 && (
            <p className="px-4 py-12 text-center text-xs text-zinc-500">
              {searching ? "No matches." : "Nothing new right now — try refreshing."}
            </p>
          )}

          {status === "ok" && !searching && total > 0 && unseenMix.length === 0 && (
            <div className="px-4 pb-1 pt-5 text-center">
              <p className="text-xs font-medium text-cyan-700 dark:text-cyan-300">
                You&apos;re all caught up ✓
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-600">
                Everything below has been seen before.
              </p>
            </div>
          )}

          {status === "ok" &&
            shownUnseen.map((item) => <FeedCard key={item.id} item={item} showSource />)}

          {status === "ok" && shownUnseen.length > 0 && shownSeen.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2" aria-label="Previously seen items">
              <span className="h-px flex-1 bg-black/[0.06] dark:bg-white/[0.06]" />
              <span className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
                seen
              </span>
              <span className="h-px flex-1 bg-black/[0.06] dark:bg-white/[0.06]" />
            </div>
          )}

          {status === "ok" &&
            shownSeen.map((item) => <FeedCard key={item.id} item={item} showSource />)}

          {status === "ok" && !showAll && <div ref={sentinelRef} className="h-px" />}

          {status === "ok" && total > 0 && showAll && !searching && (
            <div className="py-3 text-center text-[10px] text-zinc-400 md:hidden dark:text-zinc-600">
              {pull?.dir === "bottom" && pull.armed ? "Release to refresh ↻" : "Pull up to refresh"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
