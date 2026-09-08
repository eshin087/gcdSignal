import { classify, isMuted, isPrimarySource, selectItems } from "./curation";
import { discussionPlatform, reportingPublisher, stableStoryId } from "./stories";
import type { BriefStory, CategoryId, FeedItem, Prefs } from "./types";

interface RecordProgress { firstSeenAt: number; readAt?: number; coverageAddedAt?: number; dismissedAt?: number }
/** A newly found link to an already-known event is coverage, not a new event. */
export function storyProgress(story: BriefStory, records: ReadonlyMap<string, RecordProgress>, sessionStartedAt: number | null) {
  const members = (story.members ?? []).flatMap((item) => { const record = records.get(stableStoryId(item)); return record ? [record] : []; });
  const read = members.some((record) => Boolean(record.readAt));
  // null denotes the first visit. On later visits the current session boundary
  // keeps previously collected unread items from being labeled new again.
  if (sessionStartedAt === null) return { read, isNew: false, additional: false };
  const knownBefore = members.some((record) => record.firstSeenAt < sessionStartedAt);
  const newMembers = members.some((record) => record.firstSeenAt >= sessionStartedAt);
  return {
    read,
    isNew: newMembers && !knownBefore && !read,
    additional: (knownBefore && newMembers) || members.some((record) => record.firstSeenAt < sessionStartedAt && (record.coverageAddedAt ?? 0) >= sessionStartedAt),
  };
}

/** Requalify after personal filters; supporting discussion cannot replace news. */
export function visibleBriefStory(
  story: BriefStory,
  prefs: Pick<Prefs, "contentMode" | "mutedAuthors" | "mutedOutlets">,
  category: CategoryId,
  records: ReadonlyMap<string, RecordProgress>,
  windowHours: 24 | 72,
): BriefStory | null {
  const members = story.members ?? [];
  if (members.some((item) => records.get(stableStoryId(item))?.dismissedAt)) return null;
  const allowed = selectItems(members, prefs, category).map((item) => ({ ...item, curation: classify(item) }));
  const reporting = allowed.filter((item) => item.curation.substantive && reportingPublisher(item));
  const primary = reporting.find(isPrimarySource);
  const first = primary ?? reporting[0];
  if (!first) return null;
  const ordered = [first, ...allowed.filter((item) => item !== first)];
  const publishers = [...new Set(allowed.map(reportingPublisher).filter((publisher): publisher is string => Boolean(publisher)))];
  const platforms = [...new Set(allowed.map(discussionPlatform).filter((platform) => platform !== null))];
  return {
    ...story, title: first.title, members: ordered, url: first.externalUrl ?? first.url,
    primaryUrl: primary ? primary.externalUrl ?? primary.url : undefined,
    discussUrl: allowed.find((item) => discussionPlatform(item) && (item.comments ?? 0) > 0)?.url,
    thumbnail: first.thumbnail, sources: [...new Set(allowed.map((item) => item.source))],
    comments: allowed.reduce((sum, item) => sum + (item.comments ?? 0), 0) || undefined,
    publishers, platforms,
    reasons: [
      ...(primary ? ["Includes a primary source"] : []),
      publishers.length + " reporting " + (publishers.length === 1 ? "publisher" : "publishers"),
      "Earliest available report within " + windowHours + " hours",
      "Popularity is supporting evidence, not verification",
    ],
  };
}

interface FollowRecord { item: FeedItem; dismissedAt?: number; followedAt?: number; lastSeenAt: number }
/** Explicit follows and topic matches still respect author/outlet mutes. */
export function followedBriefRecords<T extends FollowRecord>(
  records: readonly T[],
  prefs: Pick<Prefs, "mutedAuthors" | "mutedOutlets" | "followedTopics">,
  followedTerms: readonly string[],
  snapshotAt: number,
): T[] {
  const terms = followedTerms.map((term) => term.trim().toLowerCase()).filter(Boolean);
  return records.filter((record) => !record.dismissedAt && !isMuted(record.item, prefs)
    && Date.parse(record.item.timestamp) >= snapshotAt - 72 * 3600000 && (
      record.followedAt || classify(record.item).topics.some((topic) => prefs.followedTopics.includes(topic))
      || terms.some((term) => (record.item.title + " " + (record.item.excerpt ?? "")).toLowerCase().includes(term))
    )).sort((a, b) => b.lastSeenAt - a.lastSeenAt).slice(0, 5);
}
