"use client";

import { useEffect, useRef, useState } from "react";
import { SORT_OPTIONS } from "@/lib/sort";
import type { SortMode } from "@/lib/types";
import { CheckIcon, SortIcon } from "./icons";

const ROW_CLS =
  "flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-black/[0.05] dark:text-zinc-300 dark:hover:bg-white/[0.06]";

export default function SortControl({
  sortMode,
  onChange,
}: {
  sortMode: SortMode;
  onChange: (m: SortMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = SORT_OPTIONS.find((o) => o.id === sortMode);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Sort items"
        className="flex items-center gap-1.5 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-black/[0.05] hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 dark:hover:bg-white/[0.06] dark:hover:text-zinc-300"
      >
        <SortIcon className="h-[18px] w-[18px]" />
        <span className="hidden text-[length:var(--fs-ui-sm)] font-medium xl:inline">{active?.label}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-black/10 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-[#141416]/95"
        >
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.id}
              role="menuitemradio"
              aria-checked={o.id === sortMode}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              className={`${ROW_CLS} ${o.id === sortMode ? "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" : ""}`}
            >
              <span className="flex-1 text-left">
                {o.label}
                <span className="block text-[10px] font-normal text-zinc-400 dark:text-zinc-600">
                  {o.desc}
                </span>
              </span>
              {o.id === sortMode && <CheckIcon className="mt-0.5 h-3 w-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
