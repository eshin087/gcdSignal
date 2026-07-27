import { fetchJson, fetchText, truncate } from "../fetch-helpers";
import type { FeedItem } from "../types";

/**
 * With a free YouTube Data API v3 key: real category search (search.list has no
 * stats, so hydrate via videos.list — 1 unit). Without a key, or on quota
 * exhaustion: curated AI-channel RSS feeds, which carry live view + like counts
 * keylessly. All channel ids verified against their feed titles.
 */
const CHANNELS: Array<{ name: string; id: string }> = [
  { name: "Two Minute Papers", id: "UCbfYPyITQ-7l4upoX8nvctg" },
  { name: "Yannic Kilcher", id: "UCZHmQk67mSJgfCCTn7xBfew" },
  { name: "AI Explained", id: "UCNJ1Ymd5yFuUPtn21xtRbbw" },
  { name: "Matt Wolfe", id: "UChpleBmo18P08aKCIgti38g" },
  { name: "Andrej Karpathy", id: "UCXUPKJO5MZQN11PqgIvyuvQ" },
  { name: "Lex Fridman", id: "UCSHZKyawb77ixDdsGog4iWA" },
  { name: "DeepLearningAI", id: "UCcIXc5mJsHVYTZR1maL5l9w" },
  { name: "Google DeepMind", id: "UCP7jMXSY2xbc3KCAE0MHQ-A" },
  { name: "OpenAI", id: "UCXZCJLdBC09xxGZ6gcdrc6A" },
  { name: "Anthropic", id: "UCrDwWp7EBBv4NwvScIpBDOA" },
];

const RSS_WINDOW_MS = 30 * 86400_000;

interface SearchItem {
  id?: { videoId?: string };
}

interface VideoItem {
  id: string;
  snippet?: { title?: string; channelTitle?: string; publishedAt?: string; description?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
}

export async function fetchYouTube(
  { q, channel }: { q?: string; channel?: string },
  fresh = false
): Promise<FeedItem[]> {
  const rv = fresh ? 0 : undefined;
  if (channel) return fetchChannelRss([{ name: "", id: channel }], rv);

  const key = process.env.YOUTUBE_API_KEY;
  if (key && q) {
    try {
      return await searchApi(q, key, rv);
    } catch {
      // Quota/key errors → keyless channel fallback below.
    }
  }
  return fetchChannelRss(CHANNELS, rv);
}

async function searchApi(q: string, key: string, revalidate?: number): Promise<FeedItem[]> {
  const publishedAfter = new Date(Date.now() - 7 * 86400_000).toISOString();
  const search = await fetchJson<{ items?: SearchItem[] }>(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount` +
      `&publishedAfter=${encodeURIComponent(publishedAfter)}&maxResults=25` +
      `&q=${encodeURIComponent(q)}&relevanceLanguage=en&key=${key}`,
    { revalidate }
  );
  const ids = (search.items ?? [])
    .map((i) => i.id?.videoId)
    .filter((v): v is string => Boolean(v));
  if (!ids.length) return [];

  const videos = await fetchJson<{ items?: VideoItem[] }>(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(",")}&key=${key}`,
    { revalidate }
  );
  return (videos.items ?? [])
    .filter((v) => v.snippet?.title)
    .map((v) => ({
      id: `yt:${v.id}`,
      source: "youtube" as const,
      title: v.snippet!.title as string,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      score: Number(v.statistics?.viewCount) || 0,
      comments: Number(v.statistics?.commentCount) || undefined,
      author: v.snippet?.channelTitle,
      timestamp: v.snippet?.publishedAt ?? new Date().toISOString(),
      excerpt: v.snippet?.description ? truncate(v.snippet.description.replace(/\s+/g, " "), 200) : undefined,
      sourceMeta: v.snippet?.channelTitle,
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

async function fetchChannelRss(
  channels: Array<{ name: string; id: string }>,
  revalidate?: number
): Promise<FeedItem[]> {
  const results = await Promise.allSettled(
    channels.map(async (ch): Promise<FeedItem[]> => {
      const feedUrl = ch.id.startsWith("UU")
        ? `https://www.youtube.com/feeds/videos.xml?playlist_id=${ch.id}`
        : `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`;
      const xml = await fetchText(feedUrl, { timeoutMs: 6000, revalidate });
      const feedTitle = /<title>([^<]+)<\/title>/.exec(xml)?.[1] ?? ch.name;
      return xml
        .split("<entry>")
        .slice(1)
        .map((entry) => {
          const videoId = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(entry)?.[1];
          const title = /<media:title>([^<]*)<\/media:title>/.exec(entry)?.[1] ?? "";
          const published = /<published>([^<]+)<\/published>/.exec(entry)?.[1];
          const views = /media:statistics views="(\d+)"/.exec(entry)?.[1];
          if (!videoId || !title || !published) return null;
          // The feed's starRating is a LIKE count — don't surface it as comments.
          return {
            id: `yt:${videoId}`,
            source: "youtube" as const,
            title,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            score: Number(views) || 0,
            author: ch.name || feedTitle,
            timestamp: published,
            sourceMeta: ch.name || feedTitle,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    })
  );
  const fulfilled = results.filter(
    (r): r is PromiseFulfilledResult<FeedItem[]> => r.status === "fulfilled"
  );
  if (!fulfilled.length) throw new Error("All YouTube channel feeds failed");

  const cutoff = Date.now() - RSS_WINDOW_MS;
  return fulfilled
    .flatMap((r) => r.value)
    .filter((v) => Date.parse(v.timestamp) > cutoff)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 25);
}
