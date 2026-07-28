"use client";

import { useState } from "react";
import { timeAgo } from "@/lib/fetch-helpers";
import { SOURCE_COLORS, SOURCE_LABELS } from "@/lib/feeds";
import { usePrefs } from "@/lib/use-prefs";
import { seenKey } from "@/lib/use-seen";
import { toggleSaved, useSavedKeys } from "@/lib/use-saved";
import type { FeedItem, SourceId } from "@/lib/types";
import { BookmarkIcon, CheckIcon, ClockIcon, CommentIcon, ShareIcon } from "./icons";
import SourceIcon from "./SourceIcon";

const SCORE_GLYPH: Record<SourceId, string> = {
  reddit: "▲",
  hackernews: "▲",
  bluesky: "♥",
  fourchan: "▲",
  rss: "▲",
  youtube: "▶",
  github: "★",
  papers: "▲",
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
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

function Thumb({ src, compact }: { src: string; compact: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={compact ? 48 : 72}
      height={compact ? 36 : 54}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`flex-none rounded-md object-cover ${
        compact ? "h-9 w-12" : "h-[54px] w-[72px]"
      }`}
    />
  );
}

export default function FeedCard({
  item,
  showSource = false,
}: {
  item: FeedItem;
  /** Show which feed the card came from (used in the mixed For You stream). */
  showSource?: boolean;
}) {
  const savedKeys = useSavedKeys();
  const { prefs } = usePrefs();
  const compact = prefs.density === "compact";
  const itemKey = seenKey(item);
  const saved = savedKeys.has(itemKey);
  const [copied, setCopied] = useState(false);

  const titleHref = safeHref(item.externalUrl) ?? safeHref(item.url);
  const discussHref = safeHref(item.url);
  const ago = timeAgo(item.timestamp);
  const color = SOURCE_COLORS[item.source];
  const thumb = item.thumbnail?.startsWith("https://") ? item.thumbnail : undefined;

  const shareHref = titleHref ?? discussHref;
  const copyLink = async () => {
    if (!shareHref) return;
    try {
      await navigator.clipboard.writeText(shareHref);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions/insecure context) — ignore.
    }
  };

  let host: string | null = null;
  if (item.source === "rss") {
    try {
      host = new URL(item.url).hostname.replace(/^www\./, "");
    } catch {
      host = null;
    }
  }

  const scoreChip = typeof item.score === "number" && (
    <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[length:var(--fs-chip)] font-semibold tabular-nums text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">
      {SCORE_GLYPH[item.source]} {formatCount(item.score)}
    </span>
  );
  const commentChip = typeof item.comments === "number" && item.comments !== item.score && (
    <span className="inline-flex items-center gap-1 rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[length:var(--fs-chip)] font-medium tabular-nums text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400">
      <CommentIcon className="h-3 w-3" />
      {formatCount(item.comments)}
    </span>
  );
  const chips = (scoreChip || commentChip) && (
    <span className="inline-flex items-center gap-2">
      {scoreChip}
      {commentChip}
    </span>
  );

  return (
    <article
      data-item-key={itemKey}
      className={`group border-b border-black/[0.05] px-3 transition-colors last:border-b-0 hover:bg-black/[0.03] dark:border-white/[0.05] dark:hover:bg-white/[0.035] ${
        compact ? "py-1.5" : "py-2.5"
      }`}
    >
      <div className="flex gap-2.5">
        <div className="min-w-0 flex-1">
          {titleHref ? (
            <a
              href={titleHref}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[length:var(--fs-title)] font-medium leading-snug tracking-[-0.01em] text-zinc-900 transition-colors visited:text-zinc-400 group-hover:text-cyan-700 dark:text-zinc-100 dark:visited:text-zinc-500 dark:group-hover:text-cyan-300"
            >
              {item.title}
            </a>
          ) : (
            <span className="block text-[length:var(--fs-title)] font-medium leading-snug">
              {item.title}
            </span>
          )}

          {item.excerpt && !compact && (
            <p className="mt-1 line-clamp-2 text-[length:var(--fs-excerpt)] leading-relaxed text-zinc-500">
              {item.excerpt}
            </p>
          )}
        </div>
        {thumb && <Thumb src={thumb} compact={compact} />}
      </div>

      <div
        className={`flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[length:var(--fs-meta)] ${
          compact ? "mt-1" : "mt-2"
        }`}
      >
        {showSource && (
          <span className="mr-0.5 inline-flex items-center gap-1">
            <SourceIcon source={item.source} className="h-3 w-3" />
            <span className="font-medium" style={{ color }}>
              {SOURCE_LABELS[item.source]}
            </span>
          </span>
        )}
        {chips &&
          (discussHref ? (
            <a
              href={discussHref}
              target="_blank"
              rel="noopener noreferrer"
              title="Open discussion"
              className="inline-flex items-center gap-2"
            >
              {chips}
            </a>
          ) : (
            chips
          ))}
        {ago && (
          <span className="tabular-nums text-sky-600/80 dark:text-sky-400/70">{ago}</span>
        )}
        {typeof item.durationSec === "number" && item.durationSec > 0 && (
          <span className="inline-flex items-center gap-0.5 tabular-nums text-zinc-400 dark:text-zinc-500">
            <ClockIcon className="h-2.5 w-2.5" />
            {formatDuration(item.durationSec)}
          </span>
        )}
        {typeof item.readMinutes === "number" && (
          <span className="inline-flex items-center gap-0.5 text-zinc-400 dark:text-zinc-500">
            <ClockIcon className="h-2.5 w-2.5" />
            {item.readMinutes} min read
          </span>
        )}
        {item.sourceMeta && (
          <span className="inline-flex min-w-0 items-center gap-1">
            {host && <Favicon host={host} color={color} />}
            <span className="truncate font-medium" style={{ color }}>
              {item.sourceMeta}
            </span>
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-0.5">
          {shareHref && (
            <button
              onClick={copyLink}
              aria-label={copied ? "Link copied" : "Copy link"}
              title={copied ? "Copied!" : "Copy link"}
              className={`rounded p-0.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 ${
                copied
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-zinc-400 hover:text-cyan-600 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 dark:text-zinc-600 dark:hover:text-cyan-300"
              }`}
            >
              {copied ? (
                <CheckIcon className="h-3.5 w-3.5" />
              ) : (
                <ShareIcon className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          <button
            onClick={() => toggleSaved(item)}
            aria-label={saved ? "Remove from saved" : "Save for later"}
            aria-pressed={saved}
            title={saved ? "Remove from saved" : "Save for later"}
            className={`rounded p-0.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 ${
              saved
                ? "text-cyan-600 dark:text-cyan-300"
                : "text-zinc-400 hover:text-cyan-600 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 dark:text-zinc-600 dark:hover:text-cyan-300"
            }`}
          >
            <BookmarkIcon className="h-3.5 w-3.5" filled={saved} />
          </button>
        </span>
      </div>
    </article>
  );
}
