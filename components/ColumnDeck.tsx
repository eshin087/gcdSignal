"use client";

import { useEffect, useRef, useState } from "react";
import type { CategoryId } from "@/lib/types";
import FeedColumn from "./FeedColumn";
import SourceIcon from "./SourceIcon";
import type { VisibleFeed } from "./Dashboard";

export default function ColumnDeck({
  feeds,
  category,
  refreshKey,
}: {
  feeds: VisibleFeed[];
  category: CategoryId;
  refreshKey: number;
}) {
  const deckRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Track which column is in view on mobile so the chip bar can highlight it.
  useEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.getAttribute("data-feed-id"));
          }
        }
      },
      { root: deck, threshold: 0.6 }
    );
    for (const el of deck.querySelectorAll("[data-feed-id]")) observer.observe(el);
    return () => observer.disconnect();
  }, [feeds]);

  const jumpTo = (id: string) => {
    const el = deckRef.current?.querySelector(`[data-feed-id="${id}"]`);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      inline: "center",
      block: "nearest",
    });
  };

  if (!feeds.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-zinc-500">
        All feeds are hidden — open Settings to turn some back on.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Mobile source chips */}
      <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-black/[0.07] px-3 py-2 md:hidden dark:border-white/[0.07]">
        {feeds.map((f) => (
          <button
            key={f.id}
            onClick={() => jumpTo(f.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              activeId === f.id
                ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                : "border-black/10 text-zinc-500 dark:border-white/15"
            }`}
          >
            <SourceIcon source={f.source} className="h-1.5 w-1.5" />
            {f.label}
          </button>
        ))}
      </div>

      <div
        ref={deckRef}
        className="flex min-h-0 flex-1 snap-x snap-mandatory gap-0 overflow-x-auto scroll-smooth md:snap-none md:gap-3 md:p-3"
      >
        {feeds.map((feed) => (
          <FeedColumn key={feed.id} feed={feed} category={category} refreshKey={refreshKey} />
        ))}
      </div>
    </div>
  );
}
