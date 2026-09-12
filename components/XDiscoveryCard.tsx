"use client";

import { timeAgo } from "@/lib/fetch-helpers";
import { usePrefs } from "@/lib/use-prefs";
import type { XDiscoveryPost } from "@/lib/x-discovery-types";
import { BookmarkIcon, CommentIcon } from "./icons";
import { FEED_CARD_TITLE_CLASS, feedCardExcerptClassName, feedCardMetadataClassName, feedCardRowClassName, formatFeedCount } from "./feed-card-style";

export default function XDiscoveryCard({ post, saved, ready, onSave, onPreview }: {
  post: XDiscoveryPost;
  saved: boolean;
  ready: boolean;
  onSave: () => void;
  onPreview: () => void;
}) {
  const { prefs } = usePrefs();
  const compact = prefs.density === "compact";

  return (
    <article data-item-key={`x:${post.id}`} tabIndex={-1} className={`${feedCardRowClassName(compact)} break-words`}>
      <h3>
        <a className={FEED_CARD_TITLE_CLASS} href={post.url} target="_blank" rel="noopener noreferrer">{post.title}</a>
      </h3>
      {post.excerpt && !compact && <p className={feedCardExcerptClassName()}>{post.excerpt}</p>}

      <div className={feedCardMetadataClassName(compact)}>
        <span className="min-w-0 break-all font-medium text-zinc-600 dark:text-zinc-400">@{post.author}</span>
        <time className="tabular-nums text-sky-600/80 dark:text-sky-400/70" dateTime={post.sharedAt}>Shared {timeAgo(post.sharedAt)}</time>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[length:var(--fs-meta)]">
        <span className="text-zinc-500 dark:text-zinc-400">Source description via</span>
        {post.mentions.map((mention) => (
          <a
            key={`${mention.source}:${mention.sourceUrl}`}
            href={mention.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 max-w-full flex-wrap items-center gap-1.5 rounded-sm text-cyan-700 hover:text-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 dark:text-cyan-300 dark:hover:text-cyan-200"
          >
            <span className="font-medium">{mention.source === "hackernews" ? "Hacker News" : "Latent Space"} ↗</span>
            {mention.source === "hackernews" && typeof mention.points === "number" && (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[length:var(--fs-chip)] font-semibold tabular-nums text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">▲ {formatFeedCount(mention.points)} HN points</span>
            )}
            {mention.source === "hackernews" && typeof mention.comments === "number" && (
              <span className="inline-flex items-center gap-1 rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[length:var(--fs-chip)] font-medium tabular-nums text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400">
                <CommentIcon className="h-3 w-3" />{formatFeedCount(mention.comments)} HN comments
              </span>
            )}
          </a>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 text-[length:var(--fs-meta)]">
        <button onClick={onPreview} aria-label="Load post from X" title="Load the original post from X" className="min-h-11 rounded-md border border-cyan-500/20 px-2 text-xs text-cyan-700 hover:bg-cyan-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 dark:text-cyan-300">Load from X ↗</button>
        <a className="inline-flex min-h-11 items-center rounded-sm text-zinc-500 hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 dark:text-zinc-400 dark:hover:text-cyan-300" href={post.url} target="_blank" rel="noopener noreferrer">Open on X ↗</a>
        <button
          onClick={onSave}
          aria-label={saved ? "Saved" : "Save post"}
          aria-pressed={saved}
          title={saved ? "Saved" : "Save post"}
          disabled={!ready || saved}
          className={`ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 ${saved ? "text-cyan-600 dark:text-cyan-300" : "text-zinc-400 hover:text-cyan-600 disabled:opacity-50 dark:text-zinc-500 dark:hover:text-cyan-300"}`}
        >
          <BookmarkIcon className="h-3.5 w-3.5" filled={saved} />
        </button>
      </div>
      <details className="text-[length:var(--fs-meta)] leading-relaxed text-zinc-500 dark:text-zinc-400">
        <summary className="min-h-11 w-fit cursor-pointer rounded-sm py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40">Why this post?</summary>
        <p className="mb-1">This description comes from the linked sources, not a fetched X post. Read the original for its full context.</p>
        <ul className="list-disc space-y-1 pb-2 pl-4">{post.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </details>
    </article>
  );
}
