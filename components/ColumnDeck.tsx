"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { CategoryId, DeckItem, SortMode } from "@/lib/types";
import FeedColumn from "./FeedColumn";
import { TrophyIcon, XBrandIcon } from "./icons";
import SourceIcon from "./SourceIcon";
import TopTenColumn from "./TopTenColumn";

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
}: {
  items: DeckItem[];
  category: CategoryId;
  refreshKey: number;
  sortMode: SortMode;
  query: string;
  onReorder: (dragId: string, targetId: string, side: DropSide) => void;
}) {
  const deckRef = useRef<HTMLDivElement>(null);
  const deckPosition = useRef(0);
  const wasFocused = useRef(false);
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
    if (!focused && wasFocused.current) deckRef.current?.scrollTo({ left: deckPosition.current, behavior: "instant" });
    wasFocused.current = Boolean(focused);
  }, [focused]);

  const toggleFocus = (id: string) => {
    if (!focused) deckPosition.current = deckRef.current?.scrollLeft ?? 0;
    setFocusId(focused ? null : id);
  };
  const jumpTo = (id: string) => {
    if (focused) { setFocusId(id); return; }
    const el = deckRef.current?.querySelector(`[data-feed-id="${id}"]`);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      inline: "center",
      block: "nearest",
    });
  };

  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) setFocusId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused]);

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

  if (!items.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-zinc-500">
        All feeds are hidden — open Settings to turn some back on.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Mobile source chips */}
      <div className={`flex shrink-0 gap-1.5 overflow-x-auto border-b border-black/[0.06] px-3 py-2 ${focused ? "" : "md:hidden"} dark:border-white/[0.06]`}>
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
                <button className="min-h-8 shrink-0 rounded-t-md text-xs text-zinc-600 hover:text-cyan-700 dark:text-zinc-400" aria-pressed={focused === it.id} onClick={() => toggleFocus(it.id)}>{focused ? "← Back to deck" : `Focus ${itemLabel(it)} ↗`}</button>
                <DeferredColumn label={itemLabel(it)}>
                {it.kind === "panel" ? (
                  it.id === "x-discovery"
                    ? <XReadingPanel refreshKey={refreshKey} dragHandleProps={dragHandleProps(it.id)} />
                    : <TopTenColumn refreshKey={refreshKey} dragHandleProps={dragHandleProps(it.id)} />
                ) : (
                  <FeedColumn
                    feed={it.feed}
                    category={category}
                    refreshKey={refreshKey}
                    sortMode={sortMode}
                    query={query}
                    dragHandleProps={dragHandleProps(it.id)}
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
