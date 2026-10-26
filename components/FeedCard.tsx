"use client";

import { useState } from "react";
import { timeAgo } from "@/lib/fetch-helpers";
import { SOURCE_COLORS, SOURCE_LABELS } from "@/lib/feeds";
import { usePrefs } from "@/lib/use-prefs";
import { seenKey } from "@/lib/use-seen";
import { toggleSaved, useSavedKeys } from "@/lib/use-saved";
import type { FeedItem, SourceId } from "@/lib/types";
import { ClockIcon, CommentIcon, StarIcon } from "./icons";
import SourceIcon from "./SourceIcon";
import { useReading } from "./ReadingContext";
import { markRead } from "@/lib/use-library";
import { FEED_CARD_TITLE_CLASS, feedCardExcerptClassName, feedCardMetadataClassName, feedCardRowClassName, formatFeedCount } from "./feed-card-style";
import QueueButton from "./QueueButton";

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

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

const safeHref = (href: string | undefined) => {
  try { const url = new URL(href ?? ""); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
};

/** RSS-item favicon with a colored letter-chip fallback. */
function Favicon({ host, color }: { host: string; color: string }) {
    return (
      <span
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] text-[8px] font-bold"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
      >
        {host[0]?.toUpperCase()}
      </span>
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
  related,
  preview = true,
}: {
  item: FeedItem;
  /** Show which feed the card came from (used in the mixed For You stream). */
  showSource?: boolean;
  related?: FeedItem[];
  preview?: boolean;
}) {
  const savedKeys = useSavedKeys();
  const read = useReading();
  const { prefs } = usePrefs();
  const compact = prefs.density === "compact";
  const itemKey = seenKey(item);
  const saved = savedKeys.has(itemKey);
  const [copied, setCopied] = useState(false);

  const titleHref = safeHref(item.externalUrl) ?? safeHref(item.url);
  const discussHref = safeHref(item.url);
  const distinctDiscussHref = discussHref && titleHref && discussHref !== titleHref ? discussHref : undefined;
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
      // Clipboard unavailable (permissions/insecure context): ignore.
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
    <span className="inline-flex items-center gap-0.5 tabular-nums text-zinc-600 dark:text-zinc-400" title="Source score">
      {SCORE_GLYPH[item.source]} {formatFeedCount(item.score)}
    </span>
  );
  const commentChip = typeof item.comments === "number" && item.comments !== item.score && (
    <span className="inline-flex items-center gap-1 tabular-nums text-zinc-600 dark:text-zinc-400">
      <CommentIcon className="h-3 w-3" />
      {formatFeedCount(item.comments)}
    </span>
  );
  const saveLabel = saved ? "Remove from saved" : "Save for later";
  return (
    <article
      data-item-key={itemKey}
      data-related-keys={related?.length ? JSON.stringify(related.map(seenKey)) : undefined}
      tabIndex={-1}
      className={feedCardRowClassName(compact)}
    >
      <div className="flex gap-2.5">
        <div className="min-w-0 flex-1">
          {titleHref ? (
            <a
              href={titleHref}
              onClick={() => markRead(related ?? [item])}
              target="_blank"
              rel="noopener noreferrer"
              className={FEED_CARD_TITLE_CLASS}
            >
              {item.title}
            </a>
          ) : (
            <span className="block text-[length:var(--fs-title)] font-medium leading-snug">
              {item.title}
            </span>
          )}

          {item.excerpt && (!compact || !preview) && (
            <p className={feedCardExcerptClassName(preview)}>
              {item.excerpt}
            </p>
          )}
        </div>
        {thumb && <Thumb src={thumb} compact={compact} />}
      </div>

      <div className={feedCardMetadataClassName(compact)}>
        {showSource && (
          <span className="mr-0.5 inline-flex items-center gap-1">
            <SourceIcon source={item.source} className="h-3 w-3" />
            <span className="font-medium" style={{ color }}>
              {SOURCE_LABELS[item.source]}
            </span>
          </span>
        )}
        {scoreChip}
        {commentChip &&
          (discussHref ? (
            <a
              href={discussHref}
              target="_blank"
              rel="noopener noreferrer"
              title="Open discussion"
              className="inline-flex items-center gap-1 hover:text-teal-700 dark:hover:text-teal-300"
            >
              {commentChip}
            </a>
          ) : (
            commentChip
          ))}
        {ago && (
          <span className="tabular-nums text-zinc-500 dark:text-zinc-400">{ago}</span>
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
      </div>
      {/* Save and Must read stay visible; everything else sits behind Details. */}
      <div className="flex items-start gap-2">
        <details data-story-details className="min-w-0 flex-1 text-[length:var(--fs-meta)] text-zinc-600 dark:text-zinc-400">
          <summary className="story-details-summary" aria-label={`Details for ${item.title}`}>Details</summary>
          <div className="story-details-body">
            {preview && <button onClick={() => read(related ?? [item])} className="story-action" aria-label={`Preview ${item.title}`}>{related && related.length > 1 ? `${related.length} sources & discussion` : "Sources & discussion"}</button>}
            {distinctDiscussHref && <a href={distinctDiscussHref} target="_blank" rel="noopener noreferrer" className="story-action">Open discussion ↗</a>}
            {shareHref && <button onClick={copyLink} aria-label={copied ? "Link copied" : "Copy link"} className="story-action">{copied ? "Copied ✓" : "Copy link"}</button>}
          </div>
        </details>
        <div className="flex shrink-0 items-center">
          <button onClick={() => toggleSaved(item)} aria-label={saveLabel} title={saveLabel} aria-pressed={saved} className="story-icon"><StarIcon className="h-4 w-4" filled={saved} /></button>
          {shareHref && <QueueButton variant="icon" id={`feed:${itemKey}`} title={item.title} url={shareHref} source={item.sourceMeta ?? SOURCE_LABELS[item.source]} />}
        </div>
      </div>
    </article>
  );
}
