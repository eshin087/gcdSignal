"use client";

import { useRef, useState, type RefObject } from "react";

const PULL_THRESHOLD_PX = 70;
const DRAG_DEADZONE_PX = 10;

export type PullState = { dir: "top" | "bottom"; armed: boolean } | null;

/**
 * Touch pull-to-refresh in both directions on a scroll container: drag down
 * from the very top, or (when `bottomEnabled`) drag up past the very bottom.
 * The container needs `overscroll-contain` so the browser's own overscroll
 * effects don't fight the gesture. Spread `handlers` onto the scroll div.
 */
export function usePullToRefresh(
  scrollRef: RefObject<HTMLDivElement | null>,
  onRefresh: () => void,
  bottomEnabled: boolean
) {
  const startRef = useRef<{ y: number; dir: "top" | "bottom" } | null>(null);
  const [pull, setPull] = useState<PullState>(null);
  const armedRef = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    const el = scrollRef.current;
    if (!el) {
      startRef.current = null;
      return;
    }
    const y = e.touches[0].clientY;
    const atTop = el.scrollTop <= 0;
    const atBottom = bottomEnabled && el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    startRef.current = atTop ? { y, dir: "top" } : atBottom ? { y, dir: "bottom" } : null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const start = startRef.current;
    if (!start) return;
    const dy = e.touches[0].clientY - start.y;
    const dist = start.dir === "top" ? dy : -dy;
    if (dist <= DRAG_DEADZONE_PX) {
      armedRef.current = false;
      setPull(null);
      return;
    }
    armedRef.current = dist > PULL_THRESHOLD_PX;
    setPull({ dir: start.dir, armed: armedRef.current });
  };

  const reset = () => {
    armedRef.current = false;
    startRef.current = null;
    setPull(null);
  };

  const onTouchEnd = () => {
    const fire = startRef.current !== null && armedRef.current;
    reset();
    if (fire) onRefresh();
  };

  return {
    pull,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: reset },
  };
}
