"use client";

import { useEffect, useState } from "react";
import { useDeckHealth, type HealthStatus } from "@/lib/feed-health";
import { timeAgo } from "@/lib/fetch-helpers";
import { useCountUp } from "@/lib/use-count-up";
import type { DeckItem } from "@/lib/types";

function itemLabel(it: DeckItem): string {
  return it.kind === "feed" ? it.feed.label : it.label;
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const OVERALL: Record<HealthStatus, { label: string; led: string; text: string }> = {
  loading: { label: "SYNCING", led: "led-loading", text: "text-cyan-600 dark:text-cyan-400" },
  ok: { label: "LIVE", led: "led-live", text: "text-emerald-600 dark:text-emerald-400" },
  stale: { label: "CACHED", led: "led-stale", text: "text-amber-600 dark:text-amber-400" },
  error: { label: "DEGRADED", led: "led-error", text: "text-rose-600 dark:text-rose-400" },
};

/**
 * Slim terminal status line: overall health, source/item counts, last sync,
 * countdown to the next auto-refresh, per-source LEDs, and the shortcut hints.
 */
export default function StatusBar({
  items,
  lastRefreshAt,
  refreshMs,
  onOpenHelp,
  onOpenPalette,
}: {
  items: DeckItem[];
  lastRefreshAt: number;
  refreshMs: number;
  onOpenHelp: () => void;
  onOpenPalette: () => void;
}) {
  const health = useDeckHealth();

  // 1s tick for the countdown / "synced Xs ago".
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const entries = items.map((it) => ({ id: it.id, label: itemLabel(it), h: health.get(it.id) }));
  const statuses = entries.map((e) => e.h?.status ?? "loading");
  const overall: HealthStatus = statuses.includes("error")
    ? "error"
    : statuses.includes("loading")
      ? "loading"
      : statuses.includes("stale")
        ? "stale"
        : "ok";
  const meta = OVERALL[overall];
  const itemTotal = useCountUp(entries.reduce((s, e) => s + (e.h?.count ?? 0), 0));
  const okSources = statuses.filter((s) => s === "ok" || s === "stale").length;
  const nextIn = refreshMs > 0 ? lastRefreshAt + refreshMs - now : null;

  return (
    <footer
      className="relative z-20 flex h-7 shrink-0 items-center gap-3 border-t border-black/[0.06] bg-white/70 px-3 font-mono text-[11px] text-zinc-500 backdrop-blur-xl dark:border-white/[0.07] dark:bg-[#0a0a0b]/70 dark:text-zinc-400"
      aria-label="Deck status"
    >
      <span className={`flex items-center gap-1.5 font-semibold tracking-wider ${meta.text}`}>
        <span className={`led ${meta.led}`} />
        {meta.label}
      </span>
      <span className="hidden sm:inline">
        {okSources}/{entries.length} sources
      </span>
      <span className="tabular-nums">{itemTotal} items</span>
      <span className="hidden tabular-nums md:inline">
        synced {timeAgo(new Date(lastRefreshAt).toISOString())}
      </span>
      {nextIn !== null && (
        <span className="hidden tabular-nums md:inline">next {mmss(nextIn)}</span>
      )}

      <span className="ml-auto hidden items-center gap-2 md:flex">
        {entries.map((e) => (
          <span
            key={e.id}
            title={`${e.label}: ${e.h?.status ?? "loading"}${e.h ? ` · ${e.h.count} items` : ""}`}
            className={`led led-${e.h?.status ?? "loading"}`}
          />
        ))}
      </span>

      <span className="flex items-center gap-2 md:ml-4">
        <button
          onClick={onOpenHelp}
          className="rounded px-1 transition-colors hover:text-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 dark:hover:text-cyan-300"
          title="Keyboard shortcuts"
        >
          ? keys
        </button>
        <button
          onClick={onOpenPalette}
          className="hidden rounded px-1 transition-colors hover:text-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 sm:inline dark:hover:text-cyan-300"
          title="Command palette"
        >
          ⌃K palette
        </button>
      </span>
    </footer>
  );
}
