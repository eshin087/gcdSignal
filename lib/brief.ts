import { classify, isPrimarySource } from "./curation";
import { engagementPercentiles } from "./sort";
import { discussionPlatform, groupStories, reportingPublisher, stableStoryId } from "./stories";
import type { BriefStory, FeedItem, SourceId } from "./types";

/** Importance-first, source-backed briefing; no private personalization or paid AI. */
export function buildTop10(items: FeedItem[], now = Date.now(), windowHours: 24 | 72 = 24): BriefStory[] {
  const pool = items.filter((it) => {
    const at = Date.parse(it.timestamp);
    // Keep the full 72h context while grouping so a fresh repost does not make
    // yesterday's unchanged story qualify as a new 24h development.
    return Number.isFinite(at) && at > now - 72 * 3600000 && at <= now + 5 * 60000;
  }).map((item) => ({ ...item, curation: classify(item) })).sort((a, b) => a.id.localeCompare(b.id));
  const pcts = engagementPercentiles(pool);
  const ranked = groupStories(pool)
    .filter((members) => {
      const first = Math.min(...members.map((it) => Date.parse(it.timestamp)));
      if (first <= now - windowHours * 3600000) return false;
      // Popularity alone cannot turn an opinion or sponsor headline into news.
      // Original announcements/research can qualify before receiving any votes,
      // but a primary byline alone cannot promote a tutorial or routine tool list.
      return members.some((it) => !it.curation?.sponsored
        && it.curation?.substantive && reportingPublisher(it));
    })
    .map((rawMembers) => {
      const members = rawMembers.filter((it) => !it.curation?.sponsored);
      const origins = [...new Set(members.map(reportingPublisher).filter((value): value is string => Boolean(value)))].sort();
      const platforms = [...new Set(members.map(discussionPlatform).filter((value): value is SourceId => Boolean(value)))].sort();
      const first = Math.min(...members.map((it) => Date.parse(it.timestamp)));
      const newest = Math.max(...members.map((it) => Date.parse(it.timestamp)));
      const primary = members.some((it) => it.curation?.substantive && isPrimarySource(it));
      // Engagement is only a small tie-breaker. Reposts do not add reporting
      // breadth, and independent origins have a bounded contribution.
      const engagement = Math.max(...members.map((it) => pcts.get(it) ?? 0.5));
      const paperOnly = members.every((it) => it.source === "papers");
      const score = (primary ? paperOnly ? 0.55 : 1.2 : 0) + Math.min(3, Math.max(0, origins.length - 1))
        + 0.6 * Math.pow(0.5, Math.max(0, (now - first) / 3600000) / 24) + 0.25 * engagement;
      const ordered = [...members].sort((a, b) => {
        const priority = (it: FeedItem) => (it.curation?.substantive ? 0 : 10)
          + (isPrimarySource(it) ? 0 : it.source === "rss" ? 1 : it.externalUrl ? 2 : 3);
        return priority(a) - priority(b) || Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id);
      });
      const rep = ordered[0];
      const primaryItem = ordered.find((it) => it.curation?.substantive && isPrimarySource(it));
      const url = rep.externalUrl ?? rep.url;
      const discussion = ordered.find((it) => discussionPlatform(it) && (it.comments ?? 0) > 0);
      const story: BriefStory = {
        id: stableStoryId(rep), title: rep.title, url,
        discussUrl: discussion?.url,
        sources: [...new Set(members.map((it) => it.source))],
        publishers: origins, platforms, members: ordered,
        primaryUrl: primaryItem ? primaryItem.externalUrl ?? primaryItem.url : undefined,
        reasons: [
          ...(primary ? ["Includes a primary source"] : []),
          origins.length > 1 ? origins.length + " reporting publishers; links may still share an underlying claim" : "Single reporting source",
          ...(platforms.length ? ["Discussion on " + platforms.join(", ")] : []),
          "Earliest available report within " + windowHours + " hours",
          "Popularity is a tie-breaker, not proof of importance",
        ],
        comments: members.reduce((sum, it) => sum + (it.comments ?? 0), 0) || undefined,
        firstPublishedAt: new Date(first).toISOString(),
        timestamp: new Date(newest).toISOString(),
        thumbnail: members.find((it) => it.thumbnail)?.thumbnail,
      };
      return { score, story };
    }).sort((a, b) => b.score - a.score || a.story.id.localeCompare(b.story.id));
  const chosen: BriefStory[] = [];
  const counts = new Map<string, number>();
  let papers = 0;
  while (ranked.length && chosen.length < 10) {
    const paperOnly = (story: BriefStory) => story.members!.every((it) => it.source === "papers");
    const nonPapersRemain = ranked.some(({ story }) => !paperOnly(story));
    const eligible = ranked.filter(({ story }) => papers < 2 || !nonPapersRemain || !paperOnly(story));
    const origin = (story: BriefStory) => reportingPublisher(story.members![0]) ?? story.sources[0];
    const next = eligible.find(({ story }) => (counts.get(origin(story)) ?? 0) < 3) ?? eligible[0];
    ranked.splice(ranked.indexOf(next), 1);
    counts.set(origin(next.story), (counts.get(origin(next.story)) ?? 0) + 1);
    if (paperOnly(next.story)) papers++;
    chosen.push(next.story);
  }
  return chosen;
}
