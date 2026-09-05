"use client";

import { useEffect, useState } from "react";

/**
 * Eases a displayed integer toward `target` over `ms` (rAF-driven, so the
 * state updates never happen synchronously inside the effect). Jumps
 * straight to the value when the OS asks for reduced motion.
 */
export function useCountUp(target: number, ms = 400): number {
  const [shown, setShown] = useState(target);

  useEffect(() => {
    const from = shown;
    if (from === target) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = reduced ? 1 : Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
    // `shown` is the tween's start point, captured when `target` changes —
    // re-running on every intermediate frame would restart the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ms]);

  return shown;
}
