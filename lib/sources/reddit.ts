import Parser from "rss-parser";
import { fetchJson, fetchText, stripHtml, truncate, USER_AGENT } from "../fetch-helpers";
import type { FeedItem } from "../types";

interface RedditPost {
  id: string;
  title: string;
  permalink: string;
  url?: string;
  is_self: boolean;
  score: number;
  num_comments: number;
  author: string;
  created_utc: number;
  selftext?: string;
  subreddit_name_prefixed: string;
  stickied: boolean;
}

interface RedditListing {
  data: { children: Array<{ data: RedditPost }> };
}

// Reddit's bot filter rejects anonymous requests that send `Accept: application/json`
// or omit Accept-Language.
const ANON_HEADERS = {
  Accept: "application/rss+xml, application/atom+xml, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

// App-only OAuth token, cached in module scope (survives across warm invocations).
let cachedToken: { token: string; expires: number } | null = null;

async function getOauthToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.token;
  try {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = { token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 };
    return cachedToken.token;
  } catch {
    return null;
  }
}

// Anonymous JSON is blocked from many networks; once it fails, skip it for a
// while instead of burning a doomed request (and rate-limit budget) every fetch.
let jsonBlockedUntil = 0;

export async function fetchReddit({ subs }: { subs: string }): Promise<FeedItem[]> {
  // Full-data path: OAuth (if creds configured), then anonymous JSON (works from
  // some networks). Last resort: the public Atom feed — hot-ranked but scoreless.
  const token = await getOauthToken();
  const attempts: Array<() => Promise<FeedItem[]>> = [];
  if (token) {
    attempts.push(async () =>
      mapListing(
        await fetchJson<RedditListing>(
          `https://oauth.reddit.com/r/${subs}/top?t=day&limit=25&raw_json=1`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
      )
    );
  }
  if (Date.now() > jsonBlockedUntil) {
    attempts.push(async () => {
      try {
        return mapListing(
          await fetchJson<RedditListing>(
            `https://www.reddit.com/r/${subs}/top.json?t=day&limit=25&raw_json=1`
          )
        );
      } catch (e) {
        jsonBlockedUntil = Date.now() + 30 * 60_000;
        throw e;
      }
    });
  }
  attempts.push(() => fetchViaRss(subs));

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const items = await attempt();
      if (items.length) return items;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Reddit fetch failed");
}

function mapListing(listing: RedditListing): FeedItem[] {
  return listing.data.children
    .map((c) => c.data)
    .filter((d) => !d.stickied)
    .map((d) => {
      const selftext = (d.selftext ?? "").replace(/\s+/g, " ").trim();
      return {
        id: `reddit:${d.id}`,
        source: "reddit" as const,
        title: d.title,
        url: `https://www.reddit.com${d.permalink}`,
        externalUrl: !d.is_self && d.url?.startsWith("http") ? d.url : undefined,
        score: d.score,
        comments: d.num_comments,
        author: d.author,
        timestamp: new Date(d.created_utc * 1000).toISOString(),
        excerpt: selftext ? truncate(selftext, 280) : undefined,
        sourceMeta: d.subreddit_name_prefixed,
      };
    });
}

async function fetchViaRss(subs: string): Promise<FeedItem[]> {
  const xml = await fetchText(`https://www.reddit.com/r/${subs}/top.rss?t=day&limit=25`, {
    headers: ANON_HEADERS,
  });
  const parsed = await new Parser().parseString(xml);
  return (parsed.items ?? [])
    .filter((item) => item.title && item.link?.startsWith("http"))
    .map((item) => {
      const sub = /\/r\/([^/]+)\//.exec(item.link ?? "")?.[1];
      const body = stripHtml(item.content ?? "")
        .replace(/submitted by\s.*$/i, "")
        .replace(/\[link\]|\[comments\]/gi, "")
        .trim();
      return {
        id: `reddit:${item.id ?? item.link}`,
        source: "reddit" as const,
        title: (item.title ?? "").trim(),
        url: item.link as string,
        author: (item as { author?: string }).author?.replace(/^\/u\//, ""),
        timestamp: item.isoDate ?? new Date().toISOString(),
        excerpt: body ? truncate(body, 280) : undefined,
        sourceMeta: sub ? `r/${sub}` : undefined,
      };
    });
}
