"use client";

import { useEffect, useRef, useState } from "react";
import type { TextScale } from "@/lib/types";
import { CheckIcon } from "./icons";

const SIZES: Array<{ id: TextScale; label: string }> = [
  { id: "sm", label: "Small" },
  { id: "md", label: "Medium" },
  { id: "lg", label: "Large" },
];

const ROW_CLS =
  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-black/[0.05] dark:text-zinc-300 dark:hover:bg-white/[0.06]";

export default function TextSizeControl({
  textScale,
  onChange,
}: {
  textScale: TextScale;
  onChange: (t: TextScale) => void;
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

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Text size"
        className="rounded-md p-1.5 text-xs font-semibold text-zinc-500 transition-colors hover:bg-black/[0.05] hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 dark:hover:bg-white/[0.06] dark:hover:text-zinc-300"
      >
        Aa
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-36 rounded-xl border border-black/10 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-[#141416]/95"
        >
          {SIZES.map((s) => (
            <button
              key={s.id}
              role="menuitemradio"
              aria-checked={s.id === textScale}
              onClick={() => {
                onChange(s.id);
                setOpen(false);
              }}
              className={`${ROW_CLS} ${s.id === textScale ? "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" : ""}`}
            >
              <span className="flex-1 text-left">{s.label}</span>
              {s.id === textScale && <CheckIcon className="h-3 w-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
