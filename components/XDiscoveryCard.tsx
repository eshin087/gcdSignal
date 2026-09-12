"use client";

import { timeAgo } from "@/lib/fetch-helpers";
import { usePrefs } from "@/lib/use-prefs";
import type { XDiscoveryPost } from "@/lib/x-discovery-types";
import { CommentIcon } from "./icons";
import { FEED_CARD_TITLE_CLASS, feedCardExcerptClassName, feedCardMetadataClassName, feedCardRowClassName, formatFeedCount } from "./feed-card-style";
import QueueButton from "./QueueButton";

export default function XDiscoveryCard({ post, saved, ready, onSave, onPreview }: {
  post: XDiscoveryPost;
  saved: boolean;
  ready: boolean;
  onSave: () => void;
  onPreview: () => void;
}) {
  const { prefs } = usePrefs();
  const compact = prefs.density === "compact";
  const hnMentions = post.mentions.filter((mention) => mention.source === "hackernews");
  const hnComments = Math.max(-1, ...hnMentions.map((mention) => mention.comments ?? -1));
  const hnDiscussion = hnMentions.find((mention) => mention.comments === hnComments) ?? hnMentions[0];

  return (
    <article data-item-key={`x:${post.id}`} tabIndex={-1} className={`${feedCardRowClassName(compact)} break-words`}>
      <h3>
        <a className={FEED_CARD_TITLE_CLASS} href={post.url} target="_blank" rel="noopener noreferrer">{post.title}</a>
      </h3>
      {post.excerpt && !compact && <p className={feedCardExcerptClassName()}>{post.excerpt}</p>}

      <div className={feedCardMetadataClassName(compact)}>
        <span className="min-w-0 break-all font-medium text-zinc-600 dark:text-zinc-400">@{post.author}</span>
        <time className="tabular-nums text-sky-600/80 dark:text-sky-400/70" dateTime={post.sharedAt}>Shared {timeAgo(post.sharedAt)}</time>
        {hnDiscussion && hnComments >= 0 && <a href={hnDiscussion.sourceUrl} target="_blank" rel="noopener noreferrer" title="Open Hacker News discussion" className="inline-flex items-center gap-1 hover:text-cyan-700 dark:hover:text-cyan-300"><CommentIcon className="h-3 w-3" />{formatFeedCount(hnComments)} HN {hnComments === 1 ? "comment" : "comments"}</a>}
      </div>
      <details data-story-details className="text-[length:var(--fs-meta)] leading-relaxed text-zinc-500 dark:text-zinc-400">
        <summary className="story-details-summary" aria-label={`Details for ${post.title}`}>Details</summary>
        <div className="story-details-body">
          <button onClick={onPreview} aria-label="Load post from X" title="Load the original post from X" className="story-action">Load post from X</button>
          <a className="story-action" href={post.url} target="_blank" rel="noopener noreferrer">Open on X ↗</a>
          <button onClick={onSave} aria-label={saved ? "Saved" : "Save post"} aria-pressed={saved} disabled={!ready || saved} className="story-action">{saved ? "Saved ✓" : "Save X link"}</button>
          <QueueButton id={`x:${post.id}`} title={post.title} url={post.url} source="X" />
        </div>
        <div className="space-y-2 pb-2">
          <p>This description and the labeled discussion counts come from the public sources below, not from a fetched X post.</p>
          <p>X views, likes, and replies are unavailable from these free discovery sources. Open the original to see X-provided counts.</p>
          <div className="flex flex-wrap gap-x-3">{post.mentions.map((mention) => <a key={`${mention.source}:${mention.sourceUrl}`} href={mention.sourceUrl} target="_blank" rel="noopener noreferrer" className="story-action">
            {mention.source === "hackernews" ? "Hacker News" : "Latent Space"}
            {mention.source === "hackernews" && typeof mention.points === "number" ? ` · ${formatFeedCount(mention.points)} HN points` : ""} ↗
          </a>)}</div>
          <ul className="list-disc space-y-1 pl-4">{post.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        </div>
      </details>
    </article>
  );
}
