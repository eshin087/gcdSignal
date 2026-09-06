import { engagementPercentiles } from "./sort";
import { groupStories, publisher } from "./stories";
import type { BriefStory, FeedItem, SourceId } from "./types";

export function buildTop10(items: FeedItem[], now = Date.now()): BriefStory[] {
  const pool = items.filter((it) => {
    const at = Date.parse(it.timestamp);
    return Number.isFinite(at) && at > now - 36 * 3600000 && at < now + 3600000;
  }).sort((a, b) => a.id.localeCompare(b.id));
  const pcts = engagementPercentiles(pool);
  const floors: Partial<Record<SourceId, number>> = { reddit: 300, hackernews: 300, youtube: 25000, rss: 0 };
  return groupStories(pool)
    .filter((members) => new Set(members.map(publisher)).size > 1 || members.some((it) =>
      floors[it.source] !== undefined && (it.score ?? 0) + 2 * (it.comments ?? 0) >= floors[it.source]!))
    .map((members) => {
      const origins = [...new Set(members.map(publisher))];
      // Each publisher/platform contributes once, even if it posts many copies.
      const engagement = origins.reduce((sum, origin) => sum + Math.max(...members.filter((it) => publisher(it) === origin).map((it) => pcts.get(it) ?? 0.5)), 0);
      const newest = Math.max(...members.map((it) => Date.parse(it.timestamp)));
      const score = (3 * (origins.length - 1) + engagement) * Math.pow(0.5, Math.max(0, (now - newest) / 3600000) / 36);
      const ordered = [...members].sort((a, b) => {
        const priority = (s: SourceId) => s === "rss" ? 0 : s === "hackernews" ? 1 : 2;
        return priority(a.source) - priority(b.source) || Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.id.localeCompare(b.id);
      });
      const rep = ordered[0];
      const url = rep.externalUrl ?? rep.url;
      const story: BriefStory = {
        id: rep.id, title: rep.title, url,
        discussUrl: rep.url !== url ? rep.url : undefined,
        sources: [...new Set(members.map((it) => it.source))],
        publishers: origins, members: ordered,
        comments: members.reduce((sum, it) => sum + (it.comments ?? 0), 0) || undefined,
        timestamp: new Date(newest).toISOString(),
        thumbnail: members.find((it) => it.thumbnail)?.thumbnail,
      };
      return { score, story };
    }).sort((a, b) => b.score - a.score || a.story.id.localeCompare(b.story.id))
    .slice(0, 10).map(({ story }) => story);
}
