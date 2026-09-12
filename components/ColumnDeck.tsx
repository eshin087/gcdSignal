"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { CategoryId, DeckItem, SortMode } from "@/lib/types";
import FeedColumn from "./FeedColumn";
import { TrophyIcon, XBrandIcon } from "./icons";
import SourceIcon from "./SourceIcon";
import TopTenColumn from "./TopTenColumn";
import { scrollColumnInRail } from "@/lib/scroll-rail";

const XReadingPanel = dynamic(() => import("./XReadingPanel"));

type DropSide = "before" | "after";

function itemLabel(it: DeckItem): string {
  return it.kind === "feed" ? it.feed.label : it.label;
}

function ItemIcon({ it, className = "h-3 w-3" }: { it: DeckItem; className?: string }) {
  if (it.kind === "feed") return <SourceIcon source={it.feed.source} className={className} />;
  if (it.id === "x-discovery") return <XBrandIcon className={className} />;
  return <TrophyIcon className={className} />;
}

export default function ColumnDeck({
  items,
  category,
  refreshKey,
  sortMode,
  query,
  onReorder,
  onFocusChange,
}: {
  items: DeckItem[];
  category: CategoryId;
  refreshKey: number;
  sortMode: SortMode;
  query: string;
  onReorder: (dragId: string, targetId: string, side: DropSide) => void;
  onFocusChange?: (focused: boolean) => void;
}) {
  const deckRef = useRef<HTMLDivElement>(null);
  const deckPosition = useRef(0);
  const wasFocused = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const returnFocusName = useRef("");
  const exitButton = useRef<HTMLButtonElement>(null);
  const scrollPositions = useRef(new Map<HTMLElement, number>());
  const [focusId, setFocusId] = useState<string | null>(null);
  const focused = items.some((it) => it.id === focusId) ? focusId : null;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; side: DropSide } | null>(null);

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
  }, [items]);

  useEffect(() => {
    onFocusChange?.(Boolean(focused));
    const shouldRestore = wasFocused.current || Boolean(focused);
    wasFocused.current = Boolean(focused);
    if (!shouldRestore) return;
    const frame = requestAnimationFrame(() => {
      for (const [element, top] of scrollPositions.current) element.scrollTop = top;
      deckRef.current?.scrollTo({ left: focused ? 0 : deckPosition.current, behavior: "instant" });
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
    if (!focusId || items.some((item) => item.id === focusId)) return;
    const timer = setTimeout(() => setFocusId(null), 0);
    return () => clearTimeout(timer);
  }, [focusId, items]);

  const enterFocus = (id: string, trigger: HTMLElement) => {
    deckPosition.current = deckRef.current?.scrollLeft ?? 0;
    returnFocus.current = trigger;
    returnFocusName.current = `Focus ${itemLabel(items.find((item) => item.id === id)!)}`;
    scrollPositions.current = new Map(Array.from(deckRef.current?.querySelectorAll<HTMLElement>(".feed-scroll") ?? [], (element) => [element, element.scrollTop]));
    setFocusId(id);
  };
  const exitFocus = useCallback(() => {
    for (const element of deckRef.current?.querySelectorAll<HTMLElement>('[data-feed-id]:not([hidden]) .feed-scroll') ?? []) {
      scrollPositions.current.set(element, element.scrollTop);
    }
    setFocusId(null);
  }, []);
  const jumpTo = (id: string) => {
    const el = deckRef.current?.querySelector(`[data-feed-id="${id}"]`);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollColumnInRail(deckRef.current, el ?? null, "center", reduced ? "auto" : "smooth");
  };

  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) { e.preventDefault(); exitFocus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, exitFocus]);

  const clearDrag = () => {
    setDragId(null);
    setDropTarget(null);
  };

  // Wheel on the empty side gutters (centered deck on wide screens) scrolls
  // every column in lockstep — a "scroll the whole wall" gesture. Wheel over
  // a column keeps its normal single-column behavior.
  const onGutterWheel = (e: React.WheelEvent) => {
    if (!e.deltaY) return;
    if ((e.target as Element).closest("[data-feed-id]")) return;
    const deck = deckRef.current;
    if (!deck) return;
    for (const el of deck.querySelectorAll<HTMLElement>(".feed-scroll")) {
      el.scrollTop += e.deltaY;
    }
  };

  const dragHandleProps = (id: string): React.HTMLAttributes<HTMLElement> => ({
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
      setDragId(id);
    },
    onDragEnd: clearDrag,
  });
  const focusAction = (id: string, label: string) => <button hidden={Boolean(focused)} draggable={false} className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-black/[0.05] hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-500/40 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-teal-300" aria-label={`Focus ${label}`} title={`Focus ${label}`} onClick={(event) => enterFocus(id, event.currentTarget)}><span aria-hidden>↗</span></button>;

  if (!items.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-zinc-500">
        All feeds are hidden — open Settings to turn some back on.
      </div>
    );
  }

  return (
    <div data-focus-mode={Boolean(focused)} className="flex min-h-0 flex-1 flex-col">
      {focused && <div className="flex min-h-11 shrink-0 items-center gap-3 border-b border-zinc-200 px-3 dark:border-zinc-800">
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-600 dark:text-zinc-400">Focus · {itemLabel(items.find((it) => it.id === focused)!)}</span>
        <button ref={exitButton} className="min-h-11 shrink-0 px-3 text-sm font-medium text-teal-700 focus-visible:outline-2 focus-visible:outline-teal-600 dark:text-teal-300" onClick={exitFocus}>Exit focus <span aria-hidden>↙</span></button>
      </div>}
      {/* Mobile source chips */}
      <div hidden={Boolean(focused)} className={`${focused ? "hidden" : "flex"} shrink-0 gap-1.5 overflow-x-auto border-b border-black/[0.06] px-3 py-2 md:hidden dark:border-white/[0.06]`}>
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => jumpTo(it.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[length:var(--fs-ui-sm)] font-medium transition-colors ${
              activeId === it.id
                ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                : "border-black/10 text-zinc-500 dark:border-white/15"
            }`}
          >
            <ItemIcon it={it} />
            {itemLabel(it)}
          </button>
        ))}
      </div>

      {/* Outer div scrolls; inner mx-auto wrapper centers the deck when it
          fits and collapses to normal flow when it overflows. */}
      <div
        ref={deckRef}
        onWheel={onGutterWheel}
        className="deck-scroll flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto scroll-smooth md:snap-none"
      >
        <div className={`mx-auto flex h-full gap-0 md:gap-3 md:px-3 md:py-3 ${focused ? "w-full max-w-4xl" : "min-w-max"}`}>
          {items.map((it) => {
            const showDrop = dropTarget?.id === it.id && dragId !== null && dragId !== it.id;
            return (
              <div
                key={it.id}
                data-feed-id={it.id}
                hidden={Boolean(focused && focused !== it.id)}
                onDragOver={(e) => {
                  if (!dragId || dragId === it.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const rect = e.currentTarget.getBoundingClientRect();
                  const side: DropSide =
                    e.clientX < rect.left + rect.width / 2 ? "before" : "after";
                  setDropTarget((cur) =>
                    cur?.id === it.id && cur.side === side ? cur : { id: it.id, side }
                  );
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dropTarget && dragId !== dropTarget.id) {
                    onReorder(dragId, dropTarget.id, dropTarget.side);
                  }
                  clearDrag();
                }}
                style={focused && focused !== it.id ? { display: "none" } : undefined}
                className={`relative flex flex-col min-h-0 flex-none snap-center transition-opacity ${focused ? "w-full" : "w-screen md:w-[340px] xl:w-[360px]"} ${
                  dragId === it.id ? "opacity-40" : ""
                }`}
              >
                {showDrop && (
                  <span
                    aria-hidden
                    className={`absolute inset-y-3 z-20 hidden w-[3px] rounded-full bg-cyan-400 md:block ${
                      dropTarget!.side === "before" ? "-left-[7.5px]" : "-right-[7.5px]"
                    }`}
                  />
                )}
                <DeferredColumn label={itemLabel(it)}>
                {it.kind === "panel" ? (
                  it.id === "x-discovery"
                    ? <XReadingPanel refreshKey={refreshKey} dragHandleProps={dragHandleProps(it.id)} headerAction={focusAction(it.id, itemLabel(it))} />
                    : <TopTenColumn refreshKey={refreshKey} dragHandleProps={dragHandleProps(it.id)} headerAction={focusAction(it.id, itemLabel(it))} />
                ) : (
                  <FeedColumn
                    feed={it.feed}
                    category={category}
                    refreshKey={refreshKey}
                    sortMode={sortMode}
                    query={query}
                    dragHandleProps={dragHandleProps(it.id)}
                    headerAction={focusAction(it.id, itemLabel(it))}
                  />
                )}
                </DeferredColumn>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Mount near the horizontal viewport once; keep mounted to preserve reading position. */
function DeferredColumn({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setMounted(true);
        observer.disconnect();
      }
    }, { root: el.closest(".deck-scroll"), rootMargin: "0px 360px", threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className="flex min-h-0 flex-1">{mounted ? children : <div className="w-full p-4 text-xs text-zinc-500">{label} · loads when nearby</div>}</div>;
}
