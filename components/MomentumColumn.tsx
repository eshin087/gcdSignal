"use client";

import { useRef } from "react";
import { timeAgo } from "@/lib/fetch-helpers";
import { useBrief } from "@/lib/use-brief";
import type { MomentumStatus } from "@/lib/types";
import { COLUMN_HEADER, COLUMN_SHELL } from "./column-shell";
import { PulseIcon, RefreshIcon } from "./icons";

const MANUAL_COOLDOWN_MS = 30_000;

const STATUS_META: Record<
  MomentumStatus,
  { label: string; arrow: string; chip: string; line: string }
> = {
  emerging: {
    label: "Emerging",
    arrow: "↗",
    chip: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400",
    line: "text-emerald-500 dark:text-emerald-400",
  },
  peaking: {
    label: "Peaking",
    arrow: "●",
    chip: "bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300",
    line: "text-amber-500 dark:text-amber-400",
  },
  steady: {
    label: "Steady",
    arrow: "→",
    chip: "bg-black/[0.04] text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400",
    line: "text-zinc-400 dark:text-zinc-500",
  },
  fading: {
    label: "Fading",
    arrow: "↘",
    chip: "bg-black/[0.03] text-zinc-400 dark:bg-white/[0.04] dark:text-zinc-500",
    line: "text-zinc-300 dark:text-zinc-600",
  },
};

function Sparkline({ points, className }: { points: number[]; className?: string }) {
  const w = 56;
  const h = 20;
  const max = Math.max(...points, 0.0001);
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - 2 - (p / max) * (h - 4)).toFixed(1)}`
    )
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`h-5 w-14 shrink-0 ${className ?? ""}`} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function MomentumColumn({
  refreshKey,
  onTopicSearch,
  dragHandleProps,
}: {
  refreshKey: number;
  onTopicSearch: (topic: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
}) {
  const { data, status, error, refetch } = useBrief(refreshKey);

  const cooldownRef = useRef(0);
  const manualRefresh = () => {
    if (Date.now() < cooldownRef.current || status === "loading") return;
    cooldownRef.current = Date.now() + MANUAL_COOLDOWN_MS;
    refetch(true);
  };

  const topics = data?.momentum ?? [];

  return (
    <section className={COLUMN_SHELL}>
      <div
        aria-hidden
        className="h-[2px] shrink-0"
        style={{
          background:
            "linear-gradient(90deg, rgb(6 182 212 / 0.6), rgb(6 182 212 / 0.08) 70%, transparent)",
        }}
      />

      <header
        {...dragHandleProps}
        className={`${COLUMN_HEADER} ${dragHandleProps ? "select-none md:cursor-grab md:active:cursor-grabbing" : ""}`}
      >
        <PulseIcon className="h-4 w-4 text-cyan-500" />
        <h2 className="truncate text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
          Momentum
        </h2>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-600">72h</span>
        <span className="ml-auto flex items-center gap-1">
          <button
            onClick={manualRefresh}
            aria-label="Refresh Momentum"
            title="Refresh Momentum"
            draggable={false}
            className="rounded p-1 text-zinc-400 transition-colors hover:bg-black/[0.05] hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 dark:text-zinc-600 dark:hover:bg-white/[0.06] dark:hover:text-zinc-300"
          >
            <RefreshIcon className={`h-3 w-3 ${status === "loading" ? "animate-spin" : ""}`} />
          </button>
        </span>
      </header>

      {status === "ok" && data?.stale && (
        <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/[0.07] px-3 py-1.5 text-[10px] leading-tight text-amber-700 dark:border-amber-400/15 dark:text-amber-300/90">
          Live fetch failed — cached {timeAgo(data.fetchedAt)}
        </div>
      )}

      <div className="feed-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {status === "loading" && (
          <div className="space-y-4 p-3" aria-label="Loading">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="skeleton h-3.5 w-2/3" />
                <div className="skeleton h-2.5 w-1/3" />
              </div>
            ))}
          </div>
        )}

        {status === "error" && (
          <div className="mx-3 my-4 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-3 text-xs leading-relaxed text-red-700 dark:border-red-400/20 dark:text-red-300/90">
            <p className="mb-1 font-medium">Couldn&apos;t compute momentum.</p>
            <p className="break-all font-mono text-[10px] opacity-60">{error}</p>
            <button
              onClick={() => refetch(true)}
              className="mt-2 rounded-md border border-black/10 px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-cyan-500/50 hover:text-cyan-600 dark:border-white/15 dark:text-zinc-300 dark:hover:border-cyan-400/50 dark:hover:text-cyan-300"
            >
              Retry
            </button>
          </div>
        )}

        {status === "ok" && topics.length === 0 && (
          <p className="px-4 py-10 text-center text-xs text-zinc-500">
            Not enough conversation volume to read momentum yet.
          </p>
        )}

        {status === "ok" &&
          topics.map((t) => {
            const meta = STATUS_META[t.status];
            return (
              <button
                key={t.topic}
                onClick={() => onTopicSearch(t.topic)}
                title={`Filter feeds for “${t.topic}”`}
                className="group block w-full border-b border-black/[0.05] px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500/40 dark:border-white/[0.05] dark:hover:bg-white/[0.035]"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[length:var(--fs-title)] font-medium text-zinc-900 transition-colors group-hover:text-cyan-700 dark:text-zinc-100 dark:group-hover:text-cyan-300">
                    {t.topic}
                  </span>
                  <Sparkline points={t.spark} className={meta.line} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[length:var(--fs-meta)]">
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[length:var(--fs-chip)] font-semibold ${meta.chip}`}
                  >
                    {meta.arrow} {meta.label}
                  </span>
                  {t.xTrending && (
                    <span
                      title="Currently trending on X"
                      className="rounded-md bg-black/[0.06] px-1.5 py-0.5 text-[length:var(--fs-chip)] font-semibold text-zinc-600 dark:bg-white/[0.09] dark:text-zinc-300"
                    >
                      𝕏 trending
                    </span>
                  )}
                  {t.auto && (
                    <span
                      title="Auto-detected spiking term"
                      className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-600"
                    >
                      new
                    </span>
                  )}
                  <span className="ml-auto tabular-nums text-zinc-400 dark:text-zinc-500">
                    {t.mentions} mentions
                  </span>
                </div>
              </button>
            );
          })}

        {status === "ok" && topics.length > 0 && (
          <p className="px-3 py-3 text-center text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-600">
            Share of conversation across all feeds, last 72h. Tap a topic to
            filter the deck.
          </p>
        )}
      </div>
    </section>
  );
}
