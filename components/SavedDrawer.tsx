"use client";

import { useEffect, useMemo } from "react";
import { clearSaved, useSavedItems } from "@/lib/use-saved";
import FeedCard from "./FeedCard";
import { XIcon } from "./icons";

export default function SavedDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const saved = useSavedItems();
  const items = useMemo(() => [...saved].sort((a, b) => b.savedAt - a.savedAt), [saved]);

  return (
    <div className={open ? "fixed inset-0 z-40" : "pointer-events-none fixed inset-0 z-40"}>
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label="Saved items"
        className={`absolute right-0 top-0 flex h-full w-96 max-w-[92vw] flex-col border-l border-black/10 bg-white/95 shadow-2xl backdrop-blur-xl transition-transform duration-200 dark:border-white/10 dark:bg-[#101013]/95 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-black/[0.07] px-4 dark:border-white/[0.07]">
          <h2 className="text-sm font-semibold">Saved ({items.length})</h2>
          <span className="flex items-center gap-1">
            {items.length > 0 && (
              <button
                onClick={clearSaved}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-black/[0.05] hover:text-red-500 dark:hover:bg-white/[0.06]"
              >
                Clear all
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close saved items"
              className="rounded p-1 text-zinc-500 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
            >
              <XIcon />
            </button>
          </span>
        </header>

        <div className="feed-scroll min-h-0 flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-zinc-500">
              Nothing saved yet — tap the bookmark on any card to keep it here.
            </p>
          ) : (
            items.map((item) => <FeedCard key={`${item.source}:${item.id}`} item={item} />)
          )}
        </div>
      </aside>
    </div>
  );
}
