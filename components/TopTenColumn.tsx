"use client";

import { useRef, useState } from "react";
import { timeAgo } from "@/lib/fetch-helpers";
import { useBrief } from "@/lib/use-brief";
import { COLUMN_HEADER, COLUMN_SHELL } from "./column-shell";
import { CommentIcon, RefreshIcon, TrophyIcon } from "./icons";
import SourceIcon from "./SourceIcon";

const MANUAL_COOLDOWN_MS = 30_000;

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function StoryThumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={64}
      height={48}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-12 w-16 flex-none rounded-md object-cover"
    />
  );
}

export default function TopTenColumn({
  refreshKey,
  dragHandleProps,
}: {
  refreshKey: number;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
}) {
  const { data, status, error, refetch } = useBrief(refreshKey);

  const cooldownRef = useRef(0);
  const manualRefresh = () => {
    if (Date.now() < cooldownRef.current || status === "loading") return;
    cooldownRef.current = Date.now() + MANUAL_COOLDOWN_MS;
    refetch(true);
  };

  const stories = data?.top10 ?? [];
  const dateLabel = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <section className={COLUMN_SHELL}>
      <div
        aria-hidden
        className="h-[2px] shrink-0"
        style={{
          background:
            "linear-gradient(90deg, rgb(245 158 11 / 0.6), rgb(245 158 11 / 0.08) 70%, transparent)",
        }}
      />

      <header
        {...dragHandleProps}
        className={`${COLUMN_HEADER} ${dragHandleProps ? "select-none md:cursor-grab md:active:cursor-grabbing" : ""}`}
      >
        <TrophyIcon className="h-4 w-4 text-amber-500" />
        <h2 className="truncate text-[length:var(--fs-colhead)] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
          Daily Top 10
        </h2>
        <span className="text-[length:var(--fs-ui-sm)] text-zinc-400 dark:text-zinc-600">{dateLabel}</span>
        <span className="ml-auto flex items-center gap-1">
          <button
            onClick={manualRefresh}
            aria-label="Refresh Daily Top 10"
            title="Refresh Daily Top 10"
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
          <div className="space-y-4 p-3" aria-label="Loading">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex gap-2.5">
                <div className="skeleton h-4 w-5 shrink-0" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="skeleton h-3 w-full" />
                  <div className="skeleton h-2.5 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {status === "error" && (
          <div className="mx-3 my-4 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-3 text-xs leading-relaxed text-red-700 dark:border-red-400/20 dark:text-red-300/90">
            <p className="mb-1 font-medium">Couldn&apos;t build today&apos;s Top 10.</p>
            <p className="break-all font-mono text-[10px] opacity-60">{error}</p>
            <button
              onClick={() => refetch(true)}
              className="mt-2 rounded-md border border-black/10 px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-cyan-500/50 hover:text-cyan-600 dark:border-white/15 dark:text-zinc-300 dark:hover:border-cyan-400/50 dark:hover:text-cyan-300"
            >
              Retry
            </button>
          </div>
        )}

        {status === "ok" && stories.length === 0 && (
          <p className="px-4 py-10 text-center text-xs text-zinc-500">
            Not enough cross-source signal yet — check back soon.
          </p>
        )}

        {status === "ok" &&
          stories.map((story, i) => (
            <article
              key={story.id}
              className="group border-b border-black/[0.05] px-3 py-3 transition-colors last:border-b-0 hover:bg-black/[0.03] dark:border-white/[0.05] dark:hover:bg-white/[0.035]"
            >
              <div className="flex gap-2.5">
                <span
                  className={`w-5 shrink-0 pt-px text-right text-[15px] tabular-nums text-amber-500 ${
                    i < 3 ? "font-extrabold" : "font-bold"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={story.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[length:var(--fs-title)] font-medium leading-snug tracking-[-0.01em] text-zinc-900 transition-colors visited:text-zinc-400 group-hover:text-cyan-700 dark:text-zinc-100 dark:visited:text-zinc-500 dark:group-hover:text-cyan-300"
                  >
                    {story.title}
                  </a>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[length:var(--fs-meta)]">
                    <span
                      className="inline-flex items-center gap-1.5"
                      title={`Covered by ${story.sources.length} source${story.sources.length > 1 ? "s" : ""}`}
                    >
                      {story.sources.map((s) => (
                        <SourceIcon key={s} source={s} className="h-3 w-3" />
                      ))}
                    </span>
                    {typeof story.comments === "number" && (
                      <a
                        href={story.discussUrl ?? story.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open discussion"
                        className="inline-flex items-center gap-1 rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[length:var(--fs-chip)] font-medium tabular-nums text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400"
                      >
                        <CommentIcon className="h-3 w-3" />
                        {formatCount(story.comments)}
                      </a>
                    )}
                    <span className="tabular-nums text-sky-600/80 dark:text-sky-400/70">
                      {timeAgo(story.timestamp)}
                    </span>
                  </div>
                </div>
                {story.thumbnail?.startsWith("https://") && <StoryThumb src={story.thumbnail} />}
              </div>
            </article>
          ))}

        {status === "ok" && stories.length > 0 && (
          <p className="px-3 py-3 text-center text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-600">
            Ranked by how many sources cover a story and how loud each one is.
          </p>
        )}
      </div>
    </section>
  );
}
