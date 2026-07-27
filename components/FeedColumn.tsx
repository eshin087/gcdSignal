"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SOURCE_COLORS } from "@/lib/feeds";
import { useFeed } from "@/lib/use-feed";
import { markSeen } from "@/lib/use-seen";
import type { CategoryId } from "@/lib/types";
import FeedCard from "./FeedCard";
import { RefreshIcon } from "./icons";
import SourceIcon from "./SourceIcon";
import type { VisibleFeed } from "./Dashboard";

const MANUAL_COOLDOWN_MS = 10_000;
const PULL_THRESHOLD_PX = 70;
const PAGE = 25;

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
  const { unseen, seenTail, status, error, refetch, requestKey } = useFeed(
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

  // Progressive reveal over the concatenated unseen+seen list; the key
  // comparison resets it to one page on every new fetch without an effect.
  const [reveal, setReveal] = useState<{ key: string; count: number } | null>(null);
  const revealed = reveal?.key === requestKey ? reveal.count : PAGE;
  const total = unseen.length + seenTail.length;
  const fullyRevealed = revealed >= total;

  const { shownUnseen, shownSeen } = useMemo(
    () => ({
      shownUnseen: unseen.slice(0, Math.min(revealed, unseen.length)),
      shownSeen: revealed > unseen.length ? seenTail.slice(0, revealed - unseen.length) : [],
    }),
    [unseen, seenTail, revealed]
  );

  // Mark cards seen once ~60% visible. root: null on purpose — with the scroll
  // div as root, columns scrolled off-screen horizontally on mobile would mark
  // their cards; the viewport root clips by every ancestor scroll container.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const keys: string[] = [];
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const key = entry.target.getAttribute("data-item-key");
            if (key) keys.push(key);
            io.unobserve(entry.target);
          }
        }
        if (keys.length) markSeen(keys);
      },
      { threshold: 0.6 }
    );
    for (const card of el.querySelectorAll("[data-item-key]")) io.observe(card);
    return () => io.disconnect();
  }, [shownUnseen, shownSeen]);

  // Reveal sentinel: extend the window when the user nears the rendered bottom.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return; // fully revealed → sentinel not rendered
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          setReveal({ key: requestKey, count: revealed + PAGE });
        }
      },
      { rootMargin: "300px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [requestKey, revealed, fullyRevealed]);

  // Bottom pull-to-refresh (mobile) — armed only once the pool is exhausted,
  // so it never fights the reveal sentinel.
  const pullStartY = useRef<number | null>(null);
  const [pullArmed, setPullArmed] = useState(false);

  const onTouchStart = (e: React.TouchEvent) => {
    const el = scrollRef.current;
    pullStartY.current =
      fullyRevealed && el && el.scrollTop + el.clientHeight >= el.scrollHeight - 4
        ? e.touches[0].clientY
        : null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (pullStartY.current === null) return;
    setPullArmed(pullStartY.current - e.touches[0].clientY > PULL_THRESHOLD_PX);
  };
  const onTouchEnd = () => {
    if (pullArmed) manualRefresh();
    setPullArmed(false);
    pullStartY.current = null;
  };

  const color = SOURCE_COLORS[feed.source];
  const networkBlocked = error !== null && /\b(403|429|blocked|rate limited)\b/i.test(error);

  return (
    <section
      data-feed-id={feed.id}
      className="flex min-h-0 w-[88vw] max-w-[380px] flex-none snap-center flex-col overflow-hidden border-r border-black/[0.06] bg-white first:border-l md:w-[340px] md:rounded-xl md:border md:border-black/[0.07] md:shadow-[0_1px_2px_rgba(0,0,0,0.04)] md:transition-colors md:hover:border-black/[0.12] xl:w-[360px] dark:border-white/[0.07] dark:bg-[#111114]/80 dark:md:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] dark:md:hover:border-white/[0.13]"
    >
      {/* Per-source accent strip */}
      <div
        aria-hidden
        className="h-[2px] shrink-0"
        style={{
          background: `linear-gradient(90deg, color-mix(in srgb, ${color} 60%, transparent), color-mix(in srgb, ${color} 8%, transparent) 70%, transparent)`,
        }}
      />

      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-black/[0.06] px-3 dark:border-white/[0.06]">
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
              title={`${unseen.length} new · ${total} total`}
            >
              {unseen.length}
            </span>
          )}
          <button
            onClick={manualRefresh}
            aria-label={`Refresh ${feed.label}`}
            title={`Refresh ${feed.label}`}
            className="rounded p-1 text-zinc-400 transition-colors hover:bg-black/[0.05] hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 dark:text-zinc-600 dark:hover:bg-white/[0.06] dark:hover:text-zinc-300"
          >
            <RefreshIcon className={`h-3 w-3 ${status === "loading" ? "animate-spin" : ""}`} />
          </button>
        </span>
      </header>

      <div
        ref={scrollRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="feed-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
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
            <p className="text-xs text-zinc-500">Nothing matching right now.</p>
            <p className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-600">
              Try another category or refresh.
            </p>
          </div>
        )}

        {status === "ok" && total > 0 && unseen.length === 0 && (
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

        {status === "ok" && !fullyRevealed && <div ref={sentinelRef} className="h-px" />}

        {status === "ok" && total > 0 && fullyRevealed && (
          <div className="py-3 text-center text-[10px] text-zinc-400 md:hidden dark:text-zinc-600">
            {pullArmed ? "Release to refresh ↻" : "Pull up to refresh"}
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
