"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { CategoryId } from "@/lib/types";
import BriefView from "./BriefView";
import { XBrandIcon } from "./icons";

const XReadingPanel = dynamic(() => import("./XReadingPanel"), {
  loading: () => <p role="status" className="p-4 text-sm text-zinc-500">Loading AI on X…</p>,
});

/** The same home on every screen: two independently scrolling columns, no X page. */
export default function HomeColumns({ category, refreshKey, showX }: {
  category: CategoryId; refreshKey: number; showX: boolean;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const brief = useRef<HTMLDivElement>(null);
  const x = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState("brief");

  useEffect(() => {
    const container = scroll.current;
    if (!container || !showX) return;
    // Geometry also handles desktop → phone resizes, where both columns were
    // previously visible and only one now fits. Observation order cannot decide it.
    const update = () => setActive(container.scrollLeft < container.clientWidth / 2 ? "brief" : "x-discovery");
    const observer = new ResizeObserver(update);
    observer.observe(container);
    container.addEventListener("scroll", update, { passive: true });
    return () => { observer.disconnect(); container.removeEventListener("scroll", update); };
  }, [showX]);

  const jump = (id: "brief" | "x-discovery") => {
    const element = id === "brief" ? brief.current : x.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element?.scrollIntoView({ inline: "start", block: "nearest", behavior: reduced ? "instant" : "smooth" });
    element?.focus({ preventScroll: true });
  };

  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    {showX && <div role="group" aria-label="Home columns" className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-1 lg:hidden dark:border-zinc-800">
      <span className="mr-auto text-xs text-zinc-500 dark:text-zinc-400">Swipe columns</span>
      <button className="action-button min-h-11" aria-label="Jump to Brief column" aria-controls="home-brief" aria-pressed={active === "brief"} onClick={() => jump("brief")}>Brief</button>
      <button className="action-button min-h-11" aria-label="Jump to X column" aria-controls="home-x" aria-pressed={active === "x-discovery"} onClick={() => jump("x-discovery")}><XBrandIcon /> AI on X →</button>
    </div>}
    <div ref={scroll} className="home-columns deck-scroll mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain lg:snap-none lg:overflow-x-hidden lg:pr-4">
      <div ref={brief} id="home-brief" data-feed-id="brief" tabIndex={-1} className="flex min-h-0 min-w-0 w-full shrink-0 snap-start flex-col focus-visible:outline-2 focus-visible:outline-teal-600 lg:w-auto lg:flex-1">
        <BriefView category={category} refreshKey={refreshKey} />
      </div>
      {showX && <div ref={x} id="home-x" data-feed-id="x-discovery" tabIndex={-1} className="flex min-h-0 min-w-0 w-full shrink-0 snap-start flex-col focus-visible:outline-2 focus-visible:outline-teal-600 lg:w-[380px] lg:py-4 xl:w-[420px]">
        <XReadingPanel refreshKey={refreshKey} />
      </div>}
    </div>
  </div>;
}
