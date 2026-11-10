import { SOURCE_LABELS } from "./feeds";
import { discussionPlatform, reportingPublisher } from "./stories";
import type { BriefStory, FeedItem, SourceId } from "./types";

/** What a Brief card states about one story without opening its sources. */
export interface BriefCard {
  /** Where the headline link leads. */
  origin: string;
  /** Text to show, and who wrote it, which is not always where the headline leads. */
  excerpt?: { text: string; credit: string };
  /** Distinct reporting publishers. */
  publishers: number;
  /** The largest counted vote total among discussion threads. */
  points?: { count: number; platform: SourceId };
  /** Comments across every member. */
  comments?: number;
}

/** A publisher's own feed: its text is the publisher's, not a poster's. */
const ownFeed = (item: FeedItem) => item.source === "rss" || item.source === "papers";
const hasText = (item: FeedItem) => Boolean(item.excerpt?.trim());

/** Who wrote an item's text: the feed or community it came from, never the site it links to. */
const textCredit = (item: FeedItem) => item.sourceMeta ?? SOURCE_LABELS[item.source];

/** A publisher's own feed carries its name; a shared link is named by its site. */
export function originLabel(item: FeedItem): string {
  if (ownFeed(item) && item.sourceMeta) return item.sourceMeta;
  return reportingPublisher(item) ?? textCredit(item);
}

/**
 * The opening of a card's evidence line. Where the headline leads and who
 * wrote the excerpt are named separately whenever they differ, whether the
 * text was borrowed from another publisher or is the poster's own remark on a
 * shared link.
 */
export function briefAttribution(card: BriefCard): string[] {
  if (!card.excerpt) return ["Via · " + card.origin];
  const credit = "Excerpt · " + card.excerpt.credit;
  return card.excerpt.credit === card.origin ? [credit] : [card.origin, credit];
}

/** Vote totals that mean the same thing to a reader; views and likes do not. */
const COUNTED: ReadonlySet<SourceId> = new Set<SourceId>(["hackernews", "reddit"]);

/**
 * The headline member is chosen for its link, and a shared link often arrives
 * with no text or with a poster's remark. A publisher's own summary of the same
 * event describes the story better, so it is preferred; a post body is shown
 * only when no publisher text exists, and is credited to where it was posted.
 */
export function briefCard(story: BriefStory): BriefCard | null {
  const members = story.members ?? [];
  const first = members[0];
  if (!first) return null;
  const summarized = members.find((item) => ownFeed(item) && hasText(item)) ?? (hasText(first) ? first : undefined);
  const counted = members
    .filter((item) => discussionPlatform(item) && COUNTED.has(item.source) && (item.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.id.localeCompare(b.id))[0];
  return {
    origin: originLabel(first),
    ...(summarized ? { excerpt: { text: summarized.excerpt!.trim(), credit: textCredit(summarized) } } : {}),
    publishers: story.publishers?.length ?? 0,
    ...(counted ? { points: { count: counted.score!, platform: counted.source } } : {}),
    ...(story.comments ? { comments: story.comments } : {}),
  };
}
