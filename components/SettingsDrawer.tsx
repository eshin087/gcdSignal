"use client";

import { useEffect } from "react";
import {
  BUILT_IN_FEEDS,
  deckKnownIds,
  effectiveOrder,
  isPanelId,
  PANEL_LABELS,
} from "@/lib/feeds";
import { clearSeen, useSeenCount } from "@/lib/use-seen";
import type { Prefs, SourceId } from "@/lib/types";
import { ChevronDownIcon, ChevronUpIcon, PlusIcon, PulseIcon, TrophyIcon, XIcon } from "./icons";
import SourceIcon from "./SourceIcon";

interface Row {
  id: string;
  label: string;
  source?: SourceId;
  panel?: "top10" | "momentum";
  isCustom: boolean;
}

export default function SettingsDrawer({
  open,
  onClose,
  prefs,
  setPrefs,
  onAddFeed,
}: {
  open: boolean;
  onClose: () => void;
  prefs: Prefs;
  setPrefs: (update: (p: Prefs) => Prefs) => void;
  onAddFeed: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const seenCount = useSeenCount();

  const orderedIds = effectiveOrder(prefs.order, deckKnownIds(prefs.custom));
  const rows: Row[] = orderedIds.flatMap((id): Row[] => {
    if (isPanelId(id)) return [{ id, label: PANEL_LABELS[id], panel: id, isCustom: false }];
    const builtIn = BUILT_IN_FEEDS.find((f) => f.id === id);
    if (builtIn) return [{ id, label: builtIn.label, source: builtIn.source, isCustom: false }];
    const custom = prefs.custom.find((c) => c.id === id);
    if (custom) return [{ id, label: custom.label, source: custom.source, isCustom: true }];
    return [];
  });

  const toggleHidden = (id: string) =>
    setPrefs((p) => ({
      ...p,
      hidden: p.hidden.includes(id) ? p.hidden.filter((x) => x !== id) : [...p.hidden, id],
    }));

  const removeCustom = (id: string) =>
    setPrefs((p) => ({
      ...p,
      custom: p.custom.filter((c) => c.id !== id),
      hidden: p.hidden.filter((x) => x !== id),
      order: p.order.filter((x) => x !== id),
    }));

  const move = (id: string, delta: -1 | 1) =>
    setPrefs((p) => {
      const ids = effectiveOrder(p.order, deckKnownIds(p.custom));
      const i = ids.indexOf(id);
      const j = i + delta;
      if (i === -1 || j < 0 || j >= ids.length) return p;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      return { ...p, order: ids };
    });

  return (
    <div className={open ? "fixed inset-0 z-40" : "pointer-events-none fixed inset-0 z-40"}>
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label="Feed settings"
        className={`absolute right-0 top-0 h-full w-80 max-w-[85vw] border-l border-black/10 bg-white/95 shadow-2xl backdrop-blur-xl transition-transform duration-200 dark:border-white/10 dark:bg-[#101013]/95 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex h-12 items-center justify-between border-b border-black/[0.07] px-4 dark:border-white/[0.07]">
          <h2 className="text-sm font-semibold">Feeds</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="rounded p-1 text-zinc-500 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
          >
            <XIcon />
          </button>
        </header>

        <div className="feed-scroll h-[calc(100%-3rem)] overflow-y-auto p-4">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
            Columns
          </p>
          <p className="mb-2 px-2 text-[11px] leading-relaxed text-zinc-500">
            The list mirrors the deck left → right. Use the arrows to reorder —
            on desktop you can also drag column headers.
          </p>
          <ul className="mb-4 space-y-1">
            {rows.map((row, i) => (
              <li
                key={row.id}
                className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
              >
                {row.source ? (
                  <SourceIcon source={row.source} />
                ) : row.panel === "top10" ? (
                  <TrophyIcon className="h-4 w-4 text-amber-500" />
                ) : (
                  <PulseIcon className="h-4 w-4 text-cyan-500" />
                )}
                <span className="min-w-0 flex-1 truncate text-[13px]" title={row.label}>
                  {row.label}
                </span>
                <span className="flex items-center">
                  <button
                    onClick={() => move(row.id, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${row.label} left`}
                    title="Move left in deck"
                    className="rounded p-0.5 text-zinc-400 hover:text-cyan-600 disabled:opacity-25 dark:hover:text-cyan-300"
                  >
                    <ChevronUpIcon />
                  </button>
                  <button
                    onClick={() => move(row.id, 1)}
                    disabled={i === rows.length - 1}
                    aria-label={`Move ${row.label} right`}
                    title="Move right in deck"
                    className="rounded p-0.5 text-zinc-400 hover:text-cyan-600 disabled:opacity-25 dark:hover:text-cyan-300"
                  >
                    <ChevronDownIcon />
                  </button>
                </span>
                <input
                  type="checkbox"
                  checked={!prefs.hidden.includes(row.id)}
                  onChange={() => toggleHidden(row.id)}
                  aria-label={`Show ${row.label}`}
                  className="h-3.5 w-3.5 accent-cyan-500"
                />
                {row.isCustom ? (
                  <button
                    onClick={() => removeCustom(row.id)}
                    aria-label={`Remove ${row.label}`}
                    title="Remove"
                    className="rounded p-0.5 text-zinc-400 hover:text-red-500"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <span className="w-[22px]" aria-hidden />
                )}
              </li>
            ))}
          </ul>

          <button
            onClick={onAddFeed}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-black/15 px-3 py-2 text-xs font-medium text-zinc-500 transition-colors hover:border-cyan-500/50 hover:text-cyan-600 dark:border-white/15 dark:hover:border-cyan-400/50 dark:hover:text-cyan-300"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add feed
          </button>

          <p className="mb-2 mt-6 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
            Reading history
          </p>
          <p className="mb-2 px-2 text-xs leading-relaxed text-zinc-500">
            Items you scroll past are hidden on the next refresh so feeds stay
            fresh. History is kept for 7 days, in this browser only.
          </p>
          <button
            onClick={clearSeen}
            disabled={seenCount === 0}
            className="w-full rounded-lg border border-black/15 px-3 py-2 text-xs font-medium text-zinc-500 transition-colors hover:border-cyan-500/50 hover:text-cyan-600 disabled:opacity-40 dark:border-white/15 dark:hover:border-cyan-400/50 dark:hover:text-cyan-300"
          >
            Clear seen history ({seenCount})
          </button>
        </div>
      </aside>
    </div>
  );
}
