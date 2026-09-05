"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface Command {
  id: string;
  label: string;
  group: string;
  /** Right-aligned hint (current value, shortcut). */
  hint?: string;
  run: () => void;
}

/** Subsequence fuzzy score: higher is better, null = no match. */
function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t.includes(q)) return 100 - t.indexOf(q);
  let ti = 0;
  let score = 0;
  for (const ch of q) {
    const idx = t.indexOf(ch, ti);
    if (idx === -1) return null;
    // Reward word-start hits and contiguity.
    score += idx === 0 || /[\s/·-]/.test(t[idx - 1] ?? "") ? 3 : idx === ti ? 2 : 1;
    ti = idx + 1;
  }
  return score;
}

export default function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const scored = commands
      .map((c) => ({ c, s: fuzzyScore(query, `${c.group} ${c.label}`) }))
      .filter((x): x is { c: Command; s: number } => x.s !== null)
      .sort((a, b) => b.s - a.s);
    return scored.slice(0, 14).map((x) => x.c);
  }, [commands, query]);

  // Keep the cursor within the (possibly shrunken) list.
  const active = Math.min(cursor, Math.max(0, matches.length - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, matches]);

  if (!open) return null;

  const close = () => {
    onClose();
    setQuery("");
    setCursor(0);
  };
  const run = (cmd: Command) => {
    close();
    cmd.run();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={close} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-black/10 bg-white/95 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl dark:border-white/10 dark:bg-[#111114]/95"
      >
        <div className="flex items-center gap-2 border-b border-black/[0.07] px-3 dark:border-white/[0.07]">
          <span className="font-mono text-cyan-500">&gt;</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(matches.length - 1, c + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const cmd = matches[active];
                if (cmd) run(cmd);
              } else if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
            placeholder="Type a command…"
            aria-label="Command"
            className="h-11 w-full bg-transparent font-mono text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
          />
          <kbd className="hidden rounded border border-black/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 sm:inline dark:border-white/15">
            esc
          </kbd>
        </div>
        <ul ref={listRef} role="listbox" className="feed-scroll max-h-[50vh] overflow-y-auto p-1.5">
          {matches.length === 0 && (
            <li className="px-3 py-6 text-center font-mono text-xs text-zinc-500">no matching command</li>
          )}
          {matches.map((cmd, i) => (
            <li
              key={cmd.id}
              data-index={i}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setCursor(i)}
              onClick={() => run(cmd)}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                i === active
                  ? "bg-cyan-500/[0.12] text-cyan-800 dark:bg-cyan-400/10 dark:text-cyan-200"
                  : "text-zinc-700 dark:text-zinc-300"
              }`}
            >
              <span className="w-20 shrink-0 truncate font-mono text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
                {cmd.group}
              </span>
              <span className="min-w-0 flex-1 truncate">{cmd.label}</span>
              {cmd.hint && (
                <span className="shrink-0 font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                  {cmd.hint}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
