"use client";

import { useRef } from "react";
import { timeAgo } from "@/lib/fetch-helpers";
import { useBrief } from "@/lib/use-brief";
import type { MomentumStatus } from "@/lib/types";
import { COLUMN_HEADER, COLUMN_SHELL } from "./column-shell";
import { PulseIcon, RefreshIcon, XIcon } from "./icons";

const MANUAL_COOLDOWN_MS = 30_000;

const STATUS_META: Record<MomentumStatus, { label: string; arrow: string; chip: string }> = {
  emerging: {
    label: "Emerging",
    arrow: "↗",
    chip: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400",
  },
  peaking: {
    label: "Peaking",
    arrow: "●",
    chip: "bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300",
  },
  steady: {
    label: "Steady",
    arrow: "→",
    chip: "bg-black/[0.04] text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400",
  },
  fading: {
    label: "Fading",
    arrow: "↘",
    chip: "bg-black/[0.03] text-zinc-400 dark:bg-white/[0.04] dark:text-zinc-500",
  },
};

const UP = "#10b981";
const DOWN = "#f43f5e";
const FLAT = "#71717a";

/**
 * Crypto-style bar matrix: one block per 6h bucket, colored by its move
 * against the previous bar (green up / red down / muted flat).
 */
function BarChart({ points }: { points: number[] }) {
  const W = 300;
  const H = 36;
  const GAP = 5;
  const n = points.length;
  const barW = (W - GAP * (n - 1)) / n;
  const max = Math.max(...points, 0.0001);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="mt-1.5 h-9 w-full"
      aria-hidden
    >
      {points.map((p, i) => {
        const h = Math.max(2, (p / max) * (H - 2));
        const prev = points[i - 1];
        const color =
          i === 0 || prev === undefined || prev <= 0
            ? p > 0
              ? UP
              : FLAT
            : p >= prev * 1.05
              ? UP
              : p <= prev * 0.95
                ? DOWN
                : FLAT;
        return (
          <rect
            key={i}
            x={(barW + GAP) * i}
            y={H - h}
            width={barW}
            height={h}
            rx={1.5}
            fill={color}
            opacity={p > 0 ? 0.9 : 0.25}
          />
        );
      })}
    </svg>
  );
}

function DeltaTicker({ changePct }: { changePct: number | null }) {
  if (changePct === null) {
    return (
      <span className="shrink-0 text-[length:var(--fs-title)] font-semibold tracking-tight text-cyan-600 dark:text-cyan-300">
        NEW
      </span>
    );
  }
  const tone =
    changePct > 5
      ? "text-emerald-600 dark:text-emerald-400"
      : changePct < -5
        ? "text-rose-600 dark:text-rose-400"
        : "text-zinc-400 dark:text-zinc-500";
  const sign = changePct > 0 ? "+" : "";
  return (
    <span
      className={`shrink-0 text-[length:var(--fs-title)] font-semibold tabular-nums tracking-tight ${tone}`}
      title="Share of conversation, last 24h vs the day before"
    >
      {sign}
      {changePct}%
    </span>
  );
}

export default function MomentumColumn({
  refreshKey,
  activeTopic,
  onTopicSearch,
  dragHandleProps,
}: {
  refreshKey: number;
  /** Current header search text — a row matching it is the active filter. */
  activeTopic: string;
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
        <h2 className="truncate text-[length:var(--fs-colhead)] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
          Momentum
        </h2>
        <span className="text-[length:var(--fs-ui-sm)] text-zinc-400 dark:text-zinc-600">72h</span>
        <span className="ml-auto flex items-center gap-1">
          <button
            onClick={manualRefresh}
            aria-label="Refresh Momentum"
            title="Refresh Momentum"
            draggable={false}
            className="rounded p-1 text-zinc-400 transition-colors hover:bg-black/[0.05] hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 dark:text-zinc-600 dark:hover:bg-white/[0.06] dark:hover:text-zinc-300"
          >
            <RefreshIcon className={`h-3.5 w-3.5 ${status === "loading" ? "animate-spin" : ""}`} />
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
          <div className="space-y-5 p-3" aria-label="Loading">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="space-y-2">
                <div className="skeleton h-3.5 w-2/3" />
                <div className="skeleton h-8 w-full" />
                <div className="skeleton h-2.5 w-1/2" />
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
            const active = activeTopic === t.topic;
            return (
              <div
                key={t.topic}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                onClick={() => onTopicSearch(active ? "" : t.topic)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onTopicSearch(active ? "" : t.topic);
                  }
                }}
                title={active ? "Clear filter" : `Filter feeds for “${t.topic}”`}
                className={`group block w-full cursor-pointer border-b border-black/[0.05] px-3 py-2.5 text-left transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500/40 dark:border-white/[0.05] ${
                  active
                    ? "bg-cyan-500/[0.07] ring-1 ring-inset ring-cyan-500/30 dark:bg-cyan-400/[0.06]"
                    : "hover:bg-black/[0.03] dark:hover:bg-white/[0.035]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`min-w-0 flex-1 truncate text-[length:var(--fs-title)] font-medium transition-colors ${
                      active
                        ? "text-cyan-700 dark:text-cyan-300"
                        : "text-zinc-900 group-hover:text-cyan-700 dark:text-zinc-100 dark:group-hover:text-cyan-300"
                    }`}
                  >
                    {t.topic}
                    {active && (
                      <XIcon className="mb-px ml-1.5 inline h-3 w-3 align-middle opacity-70" />
                    )}
                  </span>
                  {typeof t.rankDelta === "number" && (
                    <span
                      title={`${Math.abs(t.rankDelta)} spot${Math.abs(t.rankDelta) > 1 ? "s" : ""} ${t.rankDelta > 0 ? "up" : "down"} vs yesterday`}
                      className={`shrink-0 rounded px-1 py-px text-[length:var(--fs-chip)] font-semibold tabular-nums ${
                        t.rankDelta > 0
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {t.rankDelta > 0 ? "▲" : "▼"}
                      {Math.abs(t.rankDelta)}
                    </span>
                  )}
                  <DeltaTicker changePct={t.changePct} />
                </div>

                <BarChart points={t.spark} />

                <div className="mt-1.5 flex items-center gap-2 text-[length:var(--fs-meta)]">
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[length:var(--fs-chip)] font-semibold ${meta.chip}`}
                  >
                    {meta.arrow} {meta.label}
                  </span>
                  {t.xTrending && (
                    <span
                      title="Currently trending on X"
                      className="shrink-0 rounded-md bg-black/[0.06] px-1.5 py-0.5 text-[length:var(--fs-chip)] font-semibold text-zinc-600 dark:bg-white/[0.09] dark:text-zinc-300"
                    >
                      𝕏
                    </span>
                  )}
                  {t.top ? (
                    <a
                      href={t.top.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title={t.top.title}
                      className="min-w-0 flex-1 truncate text-zinc-500 transition-colors hover:text-cyan-600 dark:text-zinc-400 dark:hover:text-cyan-300"
                    >
                      ↳ {t.top.title}
                    </a>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <span className="shrink-0 tabular-nums text-zinc-400 dark:text-zinc-500">
                    {t.mentions}
                  </span>
                </div>
              </div>
            );
          })}

        {status === "ok" && topics.length > 0 && (
          <p className="px-3 py-3 text-center text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-600">
            % = share of conversation, last 24h vs the day before. Tap a topic
            to filter the deck; tap again to clear.
          </p>
        )}
      </div>
    </section>
  );
}
