"use client";

import { useState } from "react";
import { timeAgo } from "@/lib/fetch-helpers";
import { SOURCE_COLORS } from "@/lib/feeds";
import type { FeedItem, SourceId } from "@/lib/types";
import { CommentIcon } from "./icons";

const SCORE_GLYPH: Record<SourceId, string> = {
  reddit: "▲",
  hackernews: "▲",
  bluesky: "♥",
  fourchan: "▲",
  rss: "▲",
  youtube: "▶",
  github: "★",
  papers: "▲",
  x: "♥",
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

const safeHref = (href: string | undefined) =>
  href && href.startsWith("http") ? href : undefined;

/** RSS-item favicon with a colored letter-chip fallback. */
function Favicon({ host, color }: { host: string; color: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] text-[8px] font-bold"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
      >
        {host[0]?.toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`}
      alt=""
      width={14}
      height={14}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-3.5 w-3.5 shrink-0 rounded-[3px]"
      onError={() => setFailed(true)}
    />
  );
}

export default function FeedCard({ item }: { item: FeedItem }) {
  const titleHref = safeHref(item.externalUrl) ?? safeHref(item.url);
  const discussHref = safeHref(item.url);
  const ago = timeAgo(item.timestamp);
  const color = SOURCE_COLORS[item.source];

  let host: string | null = null;
  if (item.source === "rss") {
    try {
      host = new URL(item.url).hostname.replace(/^www\./, "");
    } catch {
      host = null;
    }
  }

  const scoreChip = typeof item.score === "number" && (
    <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">
      {SCORE_GLYPH[item.source]} {formatCount(item.score)}
    </span>
  );
  const commentChip = typeof item.comments === "number" && item.comments !== item.score && (
    <span className="inline-flex items-center gap-1 rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400">
      <CommentIcon className="h-3 w-3" />
      {formatCount(item.comments)}
    </span>
  );
  const chips = (scoreChip || commentChip) && (
    <span className="inline-flex items-center gap-1.5">
      {scoreChip}
      {commentChip}
    </span>
  );

  return (
    <article className="group border-b border-black/[0.05] px-3 py-2.5 transition-colors last:border-b-0 hover:bg-black/[0.03] dark:border-white/[0.05] dark:hover:bg-white/[0.035]">
      {titleHref ? (
        <a
          href={titleHref}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-[13px] font-medium leading-snug tracking-[-0.01em] text-zinc-900 transition-colors visited:text-zinc-400 group-hover:text-cyan-700 dark:text-zinc-100 dark:visited:text-zinc-500 dark:group-hover:text-cyan-300"
        >
          {item.title}
        </a>
      ) : (
        <span className="block text-[13px] font-medium leading-snug">{item.title}</span>
      )}

      {item.excerpt && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">{item.excerpt}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
        {chips &&
          (discussHref ? (
            <a
              href={discussHref}
              target="_blank"
              rel="noopener noreferrer"
              title="Open discussion"
              className="inline-flex items-center gap-1.5"
            >
              {chips}
            </a>
          ) : (
            chips
          ))}
        {ago && <span className="tabular-nums text-zinc-400 dark:text-zinc-500">{ago}</span>}
        {item.sourceMeta && (
          <span className="inline-flex min-w-0 items-center gap-1">
            {host && <Favicon host={host} color={color} />}
            <span className="truncate font-medium" style={{ color }}>
              {item.sourceMeta}
            </span>
          </span>
        )}
      </div>
    </article>
  );
}
