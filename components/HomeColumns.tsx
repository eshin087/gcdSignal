"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { CategoryId } from "@/lib/types";
import BriefView from "./BriefView";
import { XBrandIcon } from "./icons";
import { scrollColumnInRail } from "@/lib/scroll-rail";

const XReadingPanel = dynamic(() => import("./XReadingPanel"), {
  loading: () => <p role="status" className="p-4 text-sm text-zinc-500">Loading AI on X…</p>,
});

/** The same home on every screen: two independently scrolling columns, no X page. */
export default function HomeColumns({ category, refreshKey, showX, onFocusChange }: {
  category: CategoryId; refreshKey: number; showX: boolean; onFocusChange?: (focused: boolean) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const brief = useRef<HTMLDivElement>(null);
  const x = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState("brief");
  const [focusId, setFocusId] = useState<"brief" | "x-discovery" | null>(null);
  const focused = focusId === "x-discovery" && !showX ? null : focusId;
  const scrollPosition = useRef(0);
  const wasFocused = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const returnFocusName = useRef("");
  const exitButton = useRef<HTMLButtonElement>(null);
  const scrollPositions = useRef(new Map<HTMLElement, number>());

  useEffect(() => {
    onFocusChange?.(Boolean(focused));
    const shouldRestore = wasFocused.current || Boolean(focused);
    wasFocused.current = Boolean(focused);
    if (!shouldRestore) return;
    const frame = requestAnimationFrame(() => {
      for (const [element, top] of scrollPositions.current) element.scrollTop = top;
      scroll.current?.scrollTo({ left: focused ? 0 : scrollPosition.current, behavior: "instant" });
      if (focused) exitButton.current?.focus({ preventScroll: true });
      else {
        const original = returnFocus.current;
        const named = [...document.querySelectorAll<HTMLButtonElement>("button[aria-label]")].find((button) => button.getAttribute("aria-label") === returnFocusName.current && button.getClientRects().length > 0);
        const fallback = [...document.querySelectorAll<HTMLButtonElement>('button[aria-label^="Focus "], .reader-nav[aria-current="page"]')].find((button) => button.getClientRects().length > 0);
        (original?.isConnected && original.getClientRects().length > 0 ? original : named ?? fallback)?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [focused, onFocusChange]);
  useEffect(() => () => onFocusChange?.(false), [onFocusChange]);
  useEffect(() => {
    if (focusId !== "x-discovery" || showX) return;
    const timer = setTimeout(() => setFocusId(null), 0);
    return () => clearTimeout(timer);
  }, [focusId, showX]);
  const enterFocus = (id: "brief" | "x-discovery", trigger: HTMLElement) => {
    scrollPosition.current = scroll.current?.scrollLeft ?? 0;
    returnFocus.current = trigger;
    returnFocusName.current = `Focus ${id === "brief" ? "Brief" : "AI on X"}`;
    scrollPositions.current = new Map(Array.from(scroll.current?.querySelectorAll<HTMLElement>(".feed-scroll") ?? [], (element) => [element, element.scrollTop]));
    setFocusId(id);
  };
  const exitFocus = useCallback(() => {
    for (const element of scroll.current?.querySelectorAll<HTMLElement>('[data-feed-id]:not([hidden]) .feed-scroll') ?? []) scrollPositions.current.set(element, element.scrollTop);
    setFocusId(null);
  }, []);
  useEffect(() => {
    if (!focused) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) { event.preventDefault(); exitFocus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, exitFocus]);

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
    scrollColumnInRail(scroll.current, element, "start", reduced ? "auto" : "smooth");
    element?.focus({ preventScroll: true });
  };
  const focusAction = <button hidden={Boolean(focused)} draggable={false} className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-black/[0.05] hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-500/40 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-teal-300" aria-label="Focus AI on X" title="Focus AI on X" onClick={(event) => enterFocus("x-discovery", event.currentTarget)}><span aria-hidden>↗</span></button>;

  return <div data-focus-mode={Boolean(focused)} className="flex min-h-0 min-w-0 flex-1 flex-col">
    {focused && <div className="flex min-h-11 shrink-0 items-center gap-3 border-b border-zinc-200 px-3 dark:border-zinc-800">
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-600 dark:text-zinc-400">Focus · {focused === "brief" ? "Brief" : "AI on X"}</span>
      <button ref={exitButton} className="min-h-11 shrink-0 px-3 text-sm font-medium text-teal-700 focus-visible:outline-2 focus-visible:outline-teal-600 dark:text-teal-300" onClick={exitFocus}>Exit focus <span aria-hidden>↙</span></button>
    </div>}
    {showX && <div hidden={Boolean(focused)} role="group" aria-label="Home columns" className={`${focused ? "hidden" : "flex"} shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-1 lg:hidden dark:border-zinc-800`}>
      <span className="mr-auto text-xs text-zinc-500 dark:text-zinc-400">Swipe columns</span>
      <button className="action-button min-h-11" aria-label="Jump to Brief column" aria-controls="home-brief" aria-pressed={active === "brief"} onClick={() => jump("brief")}>Brief</button>
      <button className="action-button min-h-11" aria-label="Jump to X column" aria-controls="home-x" aria-pressed={active === "x-discovery"} onClick={() => jump("x-discovery")}><XBrandIcon /> AI on X →</button>
    </div>}
    <div ref={scroll} className={`home-columns deck-scroll mx-auto flex min-h-0 w-full flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain lg:snap-none lg:overflow-x-hidden ${focused ? "max-w-4xl" : "max-w-[1400px] lg:pr-4"}`}>
      <div ref={brief} id="home-brief" data-feed-id="brief" hidden={Boolean(focused && focused !== "brief")} style={focused && focused !== "brief" ? { display: "none" } : undefined} tabIndex={-1} className={`flex min-h-0 min-w-0 w-full shrink-0 snap-start flex-col focus-visible:outline-2 focus-visible:outline-teal-600 ${focused ? "" : "lg:w-auto lg:flex-1"}`}>
        <BriefView category={category} refreshKey={refreshKey} focusActive={Boolean(focused)} onFocus={(trigger) => enterFocus("brief", trigger)} />
      </div>
      {showX && <div ref={x} id="home-x" data-feed-id="x-discovery" hidden={Boolean(focused && focused !== "x-discovery")} style={focused && focused !== "x-discovery" ? { display: "none" } : undefined} tabIndex={-1} className={`flex min-h-0 min-w-0 w-full shrink-0 snap-start flex-col focus-visible:outline-2 focus-visible:outline-teal-600 ${focused ? "" : "lg:w-[380px] lg:pb-4 xl:w-[420px]"}`}>
        <XReadingPanel refreshKey={refreshKey} headerAction={focusAction} />
      </div>}
    </div>
  </div>;
}
