"use client";

import { useId, useRef } from "react";
import { timeAgo } from "@/lib/fetch-helpers";
import { useBrief } from "@/lib/use-brief";
import type { MomentumStatus } from "@/lib/types";
import { COLUMN_HEADER, COLUMN_SHELL } from "./column-shell";
import { PulseIcon, RefreshIcon } from "./icons";

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

type Tone = "up" | "down" | "flat";

const TONE_COLOR: Record<Tone, string> = {
  up: "#10b981",
  down: "#f43f5e",
  flat: "#71717a",
};

/** Net direction of the curve — drives the Robinhood green/red/gray. */
function toneOf(spark: number[]): Tone {
  const n = spark.length;
  if (n < 2) return "flat";
  const recent = (spark[n - 1] + spark[n - 2]) / 2;
  const earlier = spark.slice(0, n - 2).reduce((s, v) => s + v, 0) / Math.max(1, n - 2);
  if (recent > earlier * 1.15 && recent > 0.005) return "up";
  if (recent < earlier * 0.85) return "down";
  return "flat";
}

/**
 * Robinhood-style trend chart: smooth Catmull-Rom curve, soft gradient fill,
 * dashed baseline at the window's starting level, end-point dot.
 */
function TrendChart({ points, tone }: { points: number[]; tone: Tone }) {
  const gid = useId();
  const W = 300;
  const H = 40;
  const PAD = 4;
  const color = TONE_COLOR[tone];
  const max = Math.max(...points, 0.0001);
  const xs = points.map((_, i) => PAD + (i * (W - PAD * 2)) / (points.length - 1));
  const ys = points.map((p) => H - PAD - (p / max) * (H - PAD * 2));

  let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const x0 = xs[i - 1] ?? xs[i];
    const y0 = ys[i - 1] ?? ys[i];
    const x3 = xs[i + 2] ?? xs[i + 1];
    const y3 = ys[i + 2] ?? ys[i + 1];
    const c1x = xs[i] + (xs[i + 1] - x0) / 6;
    const c1y = ys[i] + (ys[i + 1] - y0) / 6;
    const c2x = xs[i + 1] - (x3 - xs[i]) / 6;
    const c2y = ys[i + 1] - (y3 - ys[i]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`;
  }
  const lastX = xs[xs.length - 1];
  const lastY = ys[ys.length - 1];
  const area = `${d} L${lastX.toFixed(1)},${H - 1} L${xs[0].toFixed(1)},${H - 1} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="mt-1.5 h-10 w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        x1={PAD}
        y1={ys[0]}
        x2={W - PAD}
        y2={ys[0]}
        stroke="#71717a"
        strokeOpacity="0.3"
        strokeWidth="1"
        strokeDasharray="3 4"
      />
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="6" fill={color} opacity="0.18" />
      <circle cx={lastX} cy={lastY} r="2.6" fill={color} />
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
                <div className="skeleton h-9 w-full" />
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
            return (
              <div
                key={t.topic}
                role="button"
                tabIndex={0}
                onClick={() => onTopicSearch(t.topic)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onTopicSearch(t.topic);
                  }
                }}
                title={`Filter feeds for “${t.topic}”`}
                className="group block w-full cursor-pointer border-b border-black/[0.05] px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500/40 dark:border-white/[0.05] dark:hover:bg-white/[0.035]"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[length:var(--fs-title)] font-medium text-zinc-900 transition-colors group-hover:text-cyan-700 dark:text-zinc-100 dark:group-hover:text-cyan-300">
                    {t.topic}
                  </span>
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
                </div>

                <TrendChart points={t.spark} tone={toneOf(t.spark)} />

                <div className="mt-1 flex items-center gap-2 text-[length:var(--fs-meta)]">
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
                    {t.mentions} mentions
                  </span>
                </div>
              </div>
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
