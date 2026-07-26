"use client";

import { useEffect } from "react";
import { BUILT_IN_FEEDS } from "@/lib/feeds";
import type { Prefs } from "@/lib/types";
import { PlusIcon, XIcon } from "./icons";
import SourceIcon from "./SourceIcon";

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
    }));

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
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
            Built-in
          </p>
          <ul className="mb-5 space-y-1">
            {BUILT_IN_FEEDS.map((f) => (
              <li key={f.id} className="flex items-center gap-2.5 rounded px-2 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                <SourceIcon source={f.source} />
                <span className="flex-1 text-[13px]">{f.label}</span>
                <input
                  type="checkbox"
                  checked={!prefs.hidden.includes(f.id)}
                  onChange={() => toggleHidden(f.id)}
                  aria-label={`Show ${f.label}`}
                  className="h-3.5 w-3.5 accent-cyan-500"
                />
              </li>
            ))}
          </ul>

          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
            Custom
          </p>
          {prefs.custom.length === 0 && (
            <p className="mb-3 px-2 text-xs text-zinc-500">
              No custom feeds yet — add a subreddit, RSS URL, search, hashtag, or board.
            </p>
          )}
          <ul className="mb-4 space-y-1">
            {prefs.custom.map((c) => (
              <li key={c.id} className="flex items-center gap-2.5 rounded px-2 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                <SourceIcon source={c.source} />
                <span className="flex-1 truncate text-[13px]" title={c.label}>
                  {c.label}
                </span>
                <input
                  type="checkbox"
                  checked={!prefs.hidden.includes(c.id)}
                  onChange={() => toggleHidden(c.id)}
                  aria-label={`Show ${c.label}`}
                  className="h-3.5 w-3.5 accent-cyan-500"
                />
                <button
                  onClick={() => removeCustom(c.id)}
                  aria-label={`Remove ${c.label}`}
                  title="Remove"
                  className="rounded p-0.5 text-zinc-400 hover:text-red-500"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
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
        </div>
      </aside>
    </div>
  );
}
