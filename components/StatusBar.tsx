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

const OVERALL: Record<HealthStatus, { label: string; text: string }> = {
  idle: { label: "Waiting for feeds", text: "text-zinc-500" },
  loading: { label: "Updating", text: "text-teal-700 dark:text-teal-300" },
  ok: { label: "Up to date", text: "text-emerald-700 dark:text-emerald-400" },
  stale: { label: "Cached results", text: "text-amber-700 dark:text-amber-400" },
  error: { label: "Some sources failed", text: "text-rose-700 dark:text-rose-400" },
};

/**
 * Deck footer: overall health, source/item counts, last update, countdown to
 * the next auto-refresh, per-source dots, and the shortcut buttons.
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

  // 1s tick for the countdown / "updated Xs ago".
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const entries = items.map((it) => ({ id: it.id, label: itemLabel(it), h: health.get(it.id) }));
  const statuses = entries.map((e) => e.h?.status ?? "idle");
  const overall: HealthStatus = statuses.includes("error")
    ? "error"
    : statuses.includes("loading")
      ? "loading"
      : statuses.includes("stale")
        ? "stale"
        : okStatus(statuses);
  const meta = OVERALL[overall];
  const itemTotal = useCountUp(entries.reduce((s, e) => s + (e.h?.count ?? 0), 0));
  const okSources = statuses.filter((s) => s === "ok" || s === "stale").length;
  const fetched = entries.map((e) => Date.parse(e.h?.fetchedAt ?? "")).filter(Number.isFinite);
  const oldestFetch = fetched.length ? Math.min(...fetched) : null;
  const nextIn = refreshMs > 0 ? lastRefreshAt + refreshMs - now : null;

  return (
    <footer
      className="relative z-20 flex shrink-0 items-center gap-x-3 border-t border-zinc-200 px-4 py-1 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
      aria-label="Deck status"
    >
      <span className={`flex items-center gap-1.5 font-medium ${meta.text}`}>
        <span className={`led led-${overall}`} />
        {meta.label}
      </span>
      <span className="hidden sm:inline">
        {okSources} of {entries.length} sources
      </span>
      <span className="tabular-nums">{itemTotal} items</span>
      {oldestFetch && (
        <span className="hidden tabular-nums md:inline">Updated {timeAgo(new Date(oldestFetch).toISOString())}</span>
      )}
      {nextIn !== null && (
        <span className="hidden tabular-nums md:inline">Next refresh in {mmss(nextIn)}</span>
      )}

      <span className="ml-auto hidden items-center gap-1.5 md:flex" aria-hidden="true">
        {entries.map((e) => (
          <span
            key={e.id}
            title={`${e.label}: ${e.h?.status ?? "idle"}${e.h ? ` · ${e.h.count} items` : ""}`}
            className={`led led-${e.h?.status ?? "idle"}`}
          />
        ))}
      </span>

      <span className="ml-auto flex items-center gap-2 md:ml-3">
        <button className="action-button" onClick={onOpenHelp} aria-label="Keyboard shortcuts" title="Keyboard shortcuts">?</button>
        <button className="action-button hidden sm:inline-flex" onClick={onOpenPalette} aria-label="Open command palette" title="Command palette">⌘ K</button>
      </span>
    </footer>
  );
}
function okStatus(statuses: HealthStatus[]): HealthStatus { return statuses.some((s) => s === "ok") ? "ok" : "idle"; }
