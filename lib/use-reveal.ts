"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { markSeen } from "./use-seen";

/**
 * Progressive reveal over a fetched pool: shows `page` items, extends when the
 * sentinel nears the viewport. The key comparison resets the window on every
 * new fetch without an effect.
 */
export function useProgressiveReveal(requestKey: string, total: number, page = 25) {
  const [reveal, setReveal] = useState<{ key: string; count: number } | null>(null);
  const revealed = reveal?.key === requestKey ? reveal.count : page;
  const fullyRevealed = revealed >= total;

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return; // fully revealed → sentinel not rendered
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          setReveal({ key: requestKey, count: revealed + page });
        }
      },
      { rootMargin: "300px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [requestKey, revealed, page, fullyRevealed]);

  return { revealed, fullyRevealed, sentinelRef };
}

/**
 * Marks cards seen once ~60% visible. root: null on purpose — with a scroll
 * div as root, columns scrolled off-screen horizontally on mobile would mark
 * their cards; the viewport root clips by every ancestor scroll container.
 * `enabled` gates marking off (e.g. while a search query is active).
 */
export function useMarkObserver(
  scrollRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  depA: unknown,
  depB: unknown
) {
  useEffect(() => {
    if (!enabled) return;
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
    // depA/depB stand in for the rendered slices.
  }, [scrollRef, enabled, depA, depB]);
}
