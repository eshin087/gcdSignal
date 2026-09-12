"use client";

import { useEffect, useRef } from "react";
import { clearHealth, reportHealth } from "@/lib/feed-health";
import { timeAgo } from "@/lib/fetch-helpers";
import { selectItems } from "@/lib/curation";
import { publisher } from "@/lib/stories";
import { usePrefs } from "@/lib/use-prefs";
import { useReading } from "./ReadingContext";
import { useBrief } from "@/lib/use-brief";
import { COLUMN_SHELL } from "./column-shell";
import ColumnHeader from "./ColumnHeader";
import { CommentIcon, TrophyIcon } from "./icons";
import SourceIcon from "./SourceIcon";
import QueueButton from "./QueueButton";

const MANUAL_COOLDOWN_MS = 30_000;

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

export default function TopTenColumn({
  refreshKey,
  dragHandleProps,
  headerAction,
}: {
  refreshKey: number;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  headerAction?: React.ReactNode;
}) {
  const { prefs } = usePrefs();
  const read = useReading();
  const { data, status, error, refetch } = useBrief(refreshKey);

  const cooldownRef = useRef(0);
  const manualRefresh = () => {
    if (Date.now() < cooldownRef.current || status === "loading") return;
    cooldownRef.current = Date.now() + MANUAL_COOLDOWN_MS;
    refetch();
  };

  const stories = (data?.top10 ?? []).flatMap((story) => {
    const members = selectItems(story.members ?? [{ ...story, source: story.sources[0] ?? "rss" }], prefs, "trending");
    if (!members.length) return [];
    return [{ ...story, title: members[0].title, url: members[0].externalUrl ?? members[0].url, members,
      sources: [...new Set(members.map((m) => m.source))],
      publishers: [...new Set(members.map(publisher))],
      comments: members.reduce((sum, m) => sum + (m.comments ?? 0), 0),
    }];
  });
  const dateLabel = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  const health = status === "ok" ? (data?.stale ? "stale" : "ok") : status;
  const count = stories.length;
  useEffect(() => {
    reportHealth("top10", { status: health, count, fetchedAt: data?.fetchedAt });
  }, [health, count, data?.fetchedAt]);
  useEffect(() => () => clearHealth("top10"), []);

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

      <ColumnHeader icon={<TrophyIcon className="h-4 w-4 text-amber-500" />} label="Daily Top 10" health={health}
        title={`Daily Top 10 · ${dateLabel}`} count={status === "ok" ? count : undefined} countTitle={`${count} stories`}
        onRefresh={manualRefresh} refreshing={status === "loading"} extraAction={headerAction} dragHandleProps={dragHandleProps} />

      {status === "ok" && data?.stale && (
        <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/[0.07] px-3 py-1.5 text-[10px] leading-tight text-amber-700 dark:border-amber-400/15 dark:text-amber-300/90">
          Cached results — updated {timeAgo(data.fetchedAt)}
        </div>
      )}

      <div className="feed-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {status === "loading" && (
          <div className="space-y-4 p-3" aria-label="Loading">
            <p className="font-mono text-[11px] text-cyan-600/90 dark:text-cyan-400/90">
              <span className="text-zinc-400 dark:text-zinc-600">▸ </span>
              clustering stories across sources
              <span className="cursor-blink">▍</span>
            </p>
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
              onClick={() => refetch()}
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
              tabIndex={-1}
              className="card-enter card-glow group border-b border-black/[0.05] px-3 py-3 transition-[background-color,box-shadow] last:border-b-0 hover:bg-black/[0.03] focus:outline-none focus:ring-1 focus:ring-inset focus:ring-cyan-500/60 dark:border-white/[0.05] dark:hover:bg-white/[0.035]"
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
                    {typeof story.comments === "number" && story.comments > 0 && (
                      <a
                        href={story.discussUrl ?? story.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open discussion"
                        className="inline-flex items-center gap-1 font-medium tabular-nums text-zinc-500 hover:text-cyan-700 dark:text-zinc-400 dark:hover:text-cyan-300"
                      >
                        <CommentIcon className="h-3 w-3" />
                        {formatCount(story.comments)}
                      </a>
                    )}
                    <span className="tabular-nums text-sky-600/80 dark:text-sky-400/70">
                      {timeAgo(story.timestamp)}
                    </span>
                  </div>
                  <details data-story-details className="text-[length:var(--fs-meta)] text-zinc-600 dark:text-zinc-400">
                    <summary className="story-details-summary" aria-label={`Details for ${story.title}`}>Details</summary>
                    <div className="story-details-body">
                      <button className="story-action" onClick={() => read(story.members)}>{story.members.length} {story.members.length === 1 ? "source" : "sources"} & discussion</button>
                      <QueueButton id={`feed:${story.id}`} title={story.title} url={story.primaryUrl ?? story.url} source="Daily Top 10" />
                    </div>
                  </details>
                </div>
              </div>
            </article>
          ))}

        {status === "ok" && stories.length > 0 && (
          <p className="px-3 py-3 text-center text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-600">
            Ranked by independent publishers / platforms, normalized engagement and freshness. Builder mode may show fewer than ten stories.
          </p>
        )}
      </div>
    </section>
  );
}
