"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/** Reveal in bounded chunks; visibility does not imply reading. */
export function useProgressiveReveal(requestKey: string, total: number, page = 25) {
  const [reveal, setReveal] = useState<{ key: string; count: number } | null>(null);
  const revealed = reveal?.key === requestKey ? reveal.count : page;
  const fullyRevealed = revealed >= total;
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        io.disconnect();
        setReveal({ key: requestKey, count: revealed + page });
      }
    }, { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [requestKey, revealed, page, fullyRevealed]);
  return { revealed, fullyRevealed, sentinelRef };
}

/** Compatibility shim: only explicit Read actions can mark stories read. */
export function useMarkObserver(
  _scrollRef: RefObject<HTMLDivElement | null>,
  _enabled: boolean,
  _depA: unknown,
  _depB: unknown
) {
  // Intentionally no viewport observer: scrolling past is not reading.
  void [_scrollRef, _enabled, _depA, _depB];
}
