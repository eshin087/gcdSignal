"use client";

import { useEffect, useRef, useState } from "react";
import { timeAgo } from "@/lib/fetch-helpers";
import { REFRESH_OPTIONS } from "@/lib/refresh";
import { CheckIcon, RefreshIcon } from "./icons";

const ROW_CLS =
  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-black/[0.05] dark:text-zinc-300 dark:hover:bg-white/[0.06]";

export default function RefreshControl({
  lastRefreshAt,
  onRefresh,
  refreshMs,
  onRefreshMsChange,
}: {
  lastRefreshAt: number | null;
  onRefresh: () => void;
  refreshMs: number;
  onRefreshMsChange: (ms: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Tick so the relative "updated Xm" stays fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

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

  const activeLabel = REFRESH_OPTIONS.find((o) => o.ms === refreshMs)?.label ?? "5m";

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Refresh options"
        className="flex items-center gap-1.5 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-black/[0.05] hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 dark:hover:bg-white/[0.06] dark:hover:text-zinc-300"
      >
        <RefreshIcon className="h-[18px] w-[18px]" />
        {lastRefreshAt && (
          <span className="hidden text-[length:var(--fs-ui-sm)] tabular-nums xl:inline">
            {timeAgo(new Date(lastRefreshAt).toISOString())}
          </span>
        )}
        <span className="hidden text-[length:var(--fs-ui-sm)] text-zinc-400 xl:inline dark:text-zinc-600">
          {activeLabel === "Off" ? "auto off" : `auto ${activeLabel}`}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-black/10 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-[#141416]/95"
        >
          <button
            role="menuitem"
            onClick={() => {
              onRefresh();
              setOpen(false);
            }}
            className={ROW_CLS}
          >
            <RefreshIcon className="h-3 w-3" />
            Refresh now
          </button>
          <div className="my-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
          <p className="px-2.5 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
            Auto-refresh
          </p>
          {REFRESH_OPTIONS.map((o) => (
            <button
              key={o.ms}
              role="menuitemradio"
              aria-checked={o.ms === refreshMs}
              onClick={() => {
                onRefreshMsChange(o.ms);
                setOpen(false);
              }}
              className={`${ROW_CLS} ${
                o.ms === refreshMs ? "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" : ""
              }`}
            >
              <span className="flex-1 text-left">{o.ms === 0 ? "Off" : `Every ${o.label}`}</span>
              {o.ms === refreshMs && <CheckIcon className="h-3 w-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
