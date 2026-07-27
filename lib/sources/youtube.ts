import { fetchJson, fetchText, makeMatcher, truncate } from "../fetch-helpers";
import { AI_TERMS } from "../categories";
import type { FeedItem } from "../types";

/**
 * With a free YouTube Data API v3 key: real category search (search.list has no
 * stats, so hydrate via videos.list — 1 unit). Without a key, or on quota
 * exhaustion: curated AI-channel RSS feeds, which carry live view + like counts
 * keylessly. All channel ids verified against their feed titles.
 */
const CHANNELS: Array<{ name: string; id: string; mixed?: boolean }> = [
  { name: "Two Minute Papers", id: "UCbfYPyITQ-7l4upoX8nvctg" },
  { name: "Yannic Kilcher", id: "UCZHmQk67mSJgfCCTn7xBfew" },
  { name: "AI Explained", id: "UCNJ1Ymd5yFuUPtn21xtRbbw" },
  // Mixed-content channels: only their AI videos pass the fallback filter.
  { name: "Matt Wolfe", id: "UChpleBmo18P08aKCIgti38g", mixed: true },
  { name: "Andrej Karpathy", id: "UCXUPKJO5MZQN11PqgIvyuvQ" },
  { name: "Lex Fridman", id: "UCSHZKyawb77ixDdsGog4iWA", mixed: true },
  { name: "DeepLearningAI", id: "UCcIXc5mJsHVYTZR1maL5l9w" },
  { name: "Google DeepMind", id: "UCP7jMXSY2xbc3KCAE0MHQ-A" },
  { name: "OpenAI", id: "UCXZCJLdBC09xxGZ6gcdrc6A" },
  { name: "Anthropic", id: "UCrDwWp7EBBv4NwvScIpBDOA" },
];

const RSS_WINDOW_MS = 30 * 86400_000;
const POOL_SIZE = 60;

interface SearchItem {
  id?: { videoId?: string };
}

interface VideoItem {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    description?: string;
    thumbnails?: { medium?: { url?: string } };
  };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
}

// The user's API key is HTTP-referrer-restricted to the production domain;
// sending the referer ourselves makes server-side calls pass (verified live).
const YT_HEADERS = { Referer: "https://gcdsignal.vercel.app/" };

interface RssVideo {
  item: FeedItem;
  description: string;
  mixed: boolean;
}

export async function fetchYouTube(
  { q, channel, keywords = [] }: { q?: string; channel?: string; keywords?: string[] },
  fresh = false
): Promise<FeedItem[]> {
  const rv = fresh ? 0 : undefined;
  // Custom channel feeds: raw channel uploads, no topical filtering.
  if (channel) {
    const videos = await fetchChannelRss([{ name: "", id: channel }], rv);
    return rankVideos(videos.map((v) => v.item)).slice(0, POOL_SIZE);
  }

  const key = process.env.YOUTUBE_API_KEY;
  if (key && q) {
    try {
      return await searchApi(q, key, rv);
    } catch {
      // Quota/key errors → keyless channel fallback below.
    }
  }

  const videos = await fetchChannelRss(CHANNELS, rv);
  // Mixed channels must prove AI relevance; dedicated AI channels pass as-is.
  const aiMatches = makeMatcher(AI_TERMS);
  const aiPool = videos.filter((v) => !v.mixed || aiMatches(v.item.title, v.description));

  if (!keywords.length) return rankVideos(aiPool.map((v) => v.item)).slice(0, POOL_SIZE);

  // Category matches lead; the general AI pool backfills BEHIND them so thin
  // categories still differ from Trending instead of duplicating it.
  const catMatches = makeMatcher(keywords);
  const inCategory = aiPool.filter((v) => catMatches(v.item.title, v.description));
  const rest = aiPool.filter((v) => !inCategory.includes(v));
  return [
    ...rankVideos(inCategory.map((v) => v.item)),
    ...rankVideos(rest.map((v) => v.item)),
  ].slice(0, POOL_SIZE);
}

/** Views blended with recency so one old mega-video can't sit on top forever. */
function rankVideos(items: FeedItem[]): FeedItem[] {
  const now = Date.now();
  const blend = (it: FeedItem) => {
    const ageDays = Math.max(0, (now - Date.parse(it.timestamp)) / 86400_000);
    return (it.score ?? 0) * Math.exp(-ageDays / 10);
  };
  return [...items].sort((a, b) => blend(b) - blend(a));
}

async function searchApi(q: string, key: string, revalidate?: number): Promise<FeedItem[]> {
  const publishedAfter = new Date(Date.now() - 7 * 86400_000).toISOString();
  // relevance + Science & Technology (28) keeps AI-slop shorts and phone ads
  // out (verified: viewCount ordering surfaces viral junk); the videos.list
  // hydration below re-ranks the relevant set by views.
  const search = await fetchJson<{ items?: SearchItem[] }>(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=relevance` +
      `&videoCategoryId=28&publishedAfter=${encodeURIComponent(publishedAfter)}&maxResults=50` +
      `&q=${encodeURIComponent(q)}&relevanceLanguage=en&key=${key}`,
    { revalidate, headers: YT_HEADERS }
  );
  const ids = (search.items ?? [])
    .map((i) => i.id?.videoId)
    .filter((v): v is string => Boolean(v));
  if (!ids.length) return [];

  const videos = await fetchJson<{ items?: VideoItem[] }>(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(",")}&key=${key}`,
    { revalidate, headers: YT_HEADERS }
  );
  return (videos.items ?? [])
    .filter((v) => v.snippet?.title)
    .map((v) => ({
      id: `yt:${v.id}`,
      source: "youtube" as const,
      title: v.snippet!.title as string,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      thumbnail: v.snippet?.thumbnails?.medium?.url?.startsWith("https://")
        ? v.snippet.thumbnails.medium.url
        : undefined,
      score: Number(v.statistics?.viewCount) || 0,
      comments: Number(v.statistics?.commentCount) || undefined,
      author: v.snippet?.channelTitle,
      timestamp: v.snippet?.publishedAt ?? new Date().toISOString(),
      excerpt: v.snippet?.description
        ? truncate(v.snippet.description.replace(/\s+/g, " "), 200)
        : undefined,
      sourceMeta: v.snippet?.channelTitle,
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

async function fetchChannelRss(
  channels: Array<{ name: string; id: string; mixed?: boolean }>,
  revalidate?: number
): Promise<RssVideo[]> {
  const results = await Promise.allSettled(
    channels.map(async (ch): Promise<RssVideo[]> => {
      const feedUrl = ch.id.startsWith("UU")
        ? `https://www.youtube.com/feeds/videos.xml?playlist_id=${ch.id}`
        : `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`;
      const xml = await fetchText(feedUrl, { timeoutMs: 6000, revalidate });
      const feedTitle = /<title>([^<]+)<\/title>/.exec(xml)?.[1] ?? ch.name;
      return xml
        .split("<entry>")
        .slice(1)
        .map((entry): RssVideo | null => {
          const videoId = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(entry)?.[1];
          const title = /<media:title>([^<]*)<\/media:title>/.exec(entry)?.[1] ?? "";
          const published = /<published>([^<]+)<\/published>/.exec(entry)?.[1];
          const views = /media:statistics views="(\d+)"/.exec(entry)?.[1];
          const description =
            /<media:description>([\s\S]*?)<\/media:description>/.exec(entry)?.[1] ?? "";
          if (!videoId || !title || !published) return null;
          // The feed's starRating is a LIKE count — don't surface it as comments.
          return {
            mixed: Boolean(ch.mixed),
            description: description.slice(0, 600),
            item: {
              id: `yt:${videoId}`,
              source: "youtube" as const,
              title,
              url: `https://www.youtube.com/watch?v=${videoId}`,
              thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              score: Number(views) || 0,
              author: ch.name || feedTitle,
              timestamp: published,
              sourceMeta: ch.name || feedTitle,
            },
          };
        })
        .filter((x): x is RssVideo => x !== null);
    })
  );
  const fulfilled = results.filter(
    (r): r is PromiseFulfilledResult<RssVideo[]> => r.status === "fulfilled"
  );
  if (!fulfilled.length) throw new Error("All YouTube channel feeds failed");

  const cutoff = Date.now() - RSS_WINDOW_MS;
  return fulfilled.flatMap((r) => r.value).filter((v) => Date.parse(v.item.timestamp) > cutoff);
}
