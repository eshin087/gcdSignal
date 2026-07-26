import type { FeedItem, SourceId } from "../types";
import { fetchBluesky } from "./bluesky";
import { fetchFourchan } from "./fourchan";
import { fetchHackerNews } from "./hackernews";
import { fetchMastodon } from "./mastodon";
import { fetchReddit } from "./reddit";
import { fetchRss } from "./rss";

const splitList = (s: string | undefined) =>
  (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export const SOURCES: Record<SourceId, (params: Record<string, string>) => Promise<FeedItem[]>> = {
  reddit: (p) => fetchReddit({ subs: p.subs }),
  hackernews: (p) => fetchHackerNews({ q: p.q }),
  bluesky: (p) => fetchBluesky({ q: p.q }),
  mastodon: (p) => fetchMastodon({ tags: splitList(p.tags), instance: p.instance || "mastodon.social" }),
  fourchan: (p) => fetchFourchan({ board: p.board, keywords: splitList(p.keywords) }),
  rss: (p) => fetchRss({ url: p.url || undefined, keywords: splitList(p.keywords) }),
};

export function isSourceId(v: string): v is SourceId {
  return v in SOURCES;
}
