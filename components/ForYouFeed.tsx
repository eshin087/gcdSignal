"use client";

import { useMemo, useRef } from "react";
import { selectItems } from "@/lib/curation";
import { groupStories } from "@/lib/stories";
import { usePrefs } from "@/lib/use-prefs";
import { sortItems } from "@/lib/sort";
import { useForYou } from "@/lib/use-foryou";
import { usePullToRefresh } from "@/lib/use-pull";
import { useMarkObserver, useProgressiveReveal } from "@/lib/use-reveal";
import type { CategoryId, FeedItem, SortMode, VisibleFeed } from "@/lib/types";
import FeedCard from "./FeedCard";
import { ColumnSkeleton } from "./FeedColumn";

const PAGE = 30;
const MANUAL_COOLDOWN_MS = 10_000;
const HOLD_SCROLL_PX = 80;

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
  const { prefs, setPrefs } = usePrefs();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { perSource, failures, staleLabels, status, pendingCount, apply, refetch, requestKey } =
    useForYou(feeds, category, refreshKey, () => (scrollRef.current?.scrollTop ?? 0) > HOLD_SCROLL_PX);

  const cooldownRef = useRef(0);
  const manualRefresh = () => {
    if (Date.now() < cooldownRef.current || status === "loading") return;
    cooldownRef.current = Date.now() + MANUAL_COOLDOWN_MS;
    refetch(true);
  };

  const applyPending = () => {
    apply();
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const q = query.trim().toLowerCase();
  const searching = q !== "";

  const { unseenMix, seenMix, coverage } = useMemo(() => {
    const m = (it: FeedItem) =>
      !q || `${it.title} ${it.excerpt ?? ""} ${it.sourceMeta ?? ""}`.toLowerCase().includes(q);
    // Cross-source scores are incomparable (reddit votes vs youtube views), so
    // hot/top/discussed rank per source then round-robin by deck order. "New"
    // uses real timestamps, which ARE comparable — sort globally post-merge.
    const perMode = sortMode === "new" ? "hot" : sortMode;
    const uLists = perSource.map((s) => sortItems(selectItems(s.unseen, prefs, category, s.custom).filter(m), perMode, prefs.followedTopics));
    const sLists = perSource.map((s) => sortItems(selectItems(s.seenTail, prefs, category, s.custom).filter(m), perMode, prefs.followedTopics));
    let u = roundRobin(uLists);
    let sn = roundRobin(sLists);
    if (sortMode === "new") {
      const byTime = (a: FeedItem, b: FeedItem) =>
        Date.parse(b.timestamp) - Date.parse(a.timestamp);
      u = [...u].sort(byTime);
      sn = [...sn].sort(byTime);
    }
    if (sortMode === "signal") {
      u = sortItems(u, "signal", prefs.followedTopics);
      sn = sortItems(sn, "signal", prefs.followedTopics);
    }
    const unseenKeys = new Set(u.map((it) => `${it.source}:${it.id}`));
    const groups = groupStories([...u, ...sn]);
    const coverage = new Map(groups.map((g) => [`${g[0].source}:${g[0].id}`, g]));
    return {
      unseenMix: groups.filter((g) => unseenKeys.has(`${g[0].source}:${g[0].id}`)).map((g) => g[0]),
      seenMix: groups.filter((g) => !unseenKeys.has(`${g[0].source}:${g[0].id}`)).map((g) => g[0]),
      coverage,
    };
  }, [perSource, sortMode, q, prefs, category]);

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

  useMarkObserver(scrollRef, !searching, shownUnseen, shownSeen);
  const { pull, handlers: pullHandlers } = usePullToRefresh(scrollRef, manualRefresh, showAll);

  return (
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

      <div className="foryou-scale mx-auto w-full max-w-2xl md:px-4 md:py-3">
        {pull?.dir === "top" && (
          <div className="py-2.5 text-center font-mono text-[10px] font-medium text-cyan-600 md:hidden dark:text-cyan-300">
            {pull.armed ? "release to refresh ↻" : "pull down to refresh ↓"}
          </div>
        )}

        <div className="overflow-hidden bg-white md:rounded-xl md:border md:border-black/[0.07] dark:bg-[#111114]/80 dark:md:border-white/[0.07]">
          {status === "loading" && <ColumnSkeleton label="for you" />}

          {status === "error" && (
            <div className="m-4 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-3 text-xs leading-relaxed text-red-700 dark:border-red-400/20 dark:text-red-300/90">
              <p className="mb-1 font-medium">Couldn&apos;t load any feeds.</p>
              <p className="break-all font-mono text-[10px] opacity-60">
                {failures[0]?.message}
              </p>
            </div>
          )}

          {status === "ok" && failures.length > 0 && (
            <p className="border-b border-black/[0.05] px-4 py-2 font-mono text-[11px] text-zinc-400 dark:border-white/[0.05] dark:text-zinc-600">
              unavailable right now: {failures.map((f) => f.label).join(", ")}
            </p>
          )}

          {status === "ok" && staleLabels.length > 0 && (
            <p className="border-b border-amber-500/15 bg-amber-500/[0.06] px-4 py-2 font-mono text-[11px] text-amber-700 dark:text-amber-300/90">
              showing cached results for: {staleLabels.join(", ")}
            </p>
          )}

          {status === "ok" && total < 5 && prefs.contentMode === "builder" && !searching && <div className="px-4 py-3 text-xs">Fewer builder matches here. <button className="action-button" onClick={() => setPrefs((p) => ({ ...p, contentMode: "broad" }))}>Explore Broad</button></div>}
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
            shownUnseen.map((item) => <FeedCard key={`${item.source}:${item.id}`} item={item} related={coverage.get(`${item.source}:${item.id}`)} showSource />)}

          {status === "ok" && shownUnseen.length > 0 && shownSeen.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2" aria-label="Previously seen items">
              <span className="h-px flex-1 bg-black/[0.06] dark:bg-white/[0.06]" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
                seen
              </span>
              <span className="h-px flex-1 bg-black/[0.06] dark:bg-white/[0.06]" />
            </div>
          )}

          {status === "ok" &&
            shownSeen.map((item) => <FeedCard key={`${item.source}:${item.id}`} item={item} related={coverage.get(`${item.source}:${item.id}`)} showSource />)}

          {status === "ok" && !showAll && <div ref={sentinelRef} className="h-px" />}

          {status === "ok" && total > 0 && showAll && !searching && (
            <div className="py-3 text-center font-mono text-[10px] text-zinc-400 md:hidden dark:text-zinc-600">
              {pull?.dir === "bottom" && pull.armed ? "release to refresh ↻" : "pull up to refresh"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
