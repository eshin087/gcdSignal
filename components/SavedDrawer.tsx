"use client";

import { useMemo } from "react";
import { useDialog } from "@/lib/use-dialog";
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
  const ref = useDialog(open);

  const saved = useSavedItems();
  const items = useMemo(() => [...saved].sort((a, b) => b.savedAt - a.savedAt), [saved]);

  return (
    <dialog ref={ref} className="reader-dialog" aria-label="Saved items" onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex h-full min-h-0 flex-col">
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
            items.map((item) => <FeedCard key={`${item.source}:${item.id}`} item={item} preview={false} />)
          )}
        </div>
      </div>
    </dialog>
  );
}
