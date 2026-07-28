"use client";

import { useEffect, useRef, useState } from "react";
import type { Density, TextScale } from "@/lib/types";

const SIZES: Array<{ id: TextScale; label: string }> = [
  { id: "sm", label: "S" },
  { id: "md", label: "M" },
  { id: "lg", label: "L" },
  { id: "xl", label: "XL" },
];

const DENSITIES: Array<{ id: Density; label: string }> = [
  { id: "comfortable", label: "Comfortable" },
  { id: "compact", label: "Compact" },
];

const SEG_BTN =
  "flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors";
const SEG_ON = "bg-cyan-500/[0.12] text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-300";
const SEG_OFF = "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300";

export default function DisplayControl({
  textScale,
  onTextScaleChange,
  density,
  onDensityChange,
}: {
  textScale: TextScale;
  onTextScaleChange: (t: TextScale) => void;
  density: Density;
  onDensityChange: (d: Density) => void;
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
        title="Text size & density"
        className="rounded-md p-1.5 text-xs font-semibold text-zinc-500 transition-colors hover:bg-black/[0.05] hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 dark:hover:bg-white/[0.06] dark:hover:text-zinc-300"
      >
        Aa
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-black/10 bg-white/95 p-2.5 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-[#141416]/95"
        >
          <p className="pb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
            Text size
          </p>
          <div className="flex items-center gap-0.5 rounded-lg border border-black/10 p-0.5 dark:border-white/10">
            {SIZES.map((s) => (
              <button
                key={s.id}
                role="menuitemradio"
                aria-checked={s.id === textScale}
                onClick={() => onTextScaleChange(s.id)}
                className={`${SEG_BTN} ${s.id === textScale ? SEG_ON : SEG_OFF}`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <p className="pb-1 pt-3 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
            Density
          </p>
          <div className="flex items-center gap-0.5 rounded-lg border border-black/10 p-0.5 dark:border-white/10">
            {DENSITIES.map((d) => (
              <button
                key={d.id}
                role="menuitemradio"
                aria-checked={d.id === density}
                onClick={() => onDensityChange(d.id)}
                className={`${SEG_BTN} ${d.id === density ? SEG_ON : SEG_OFF}`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="px-0.5 pt-2 text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-600">
            Compact hides excerpts for a denser scan.
          </p>
        </div>
      )}
    </div>
  );
}
