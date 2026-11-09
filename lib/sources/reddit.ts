import Parser from "rss-parser";
import {
  decodeEntities,
  fetchJson,
  fetchText,
  makeMatcher,
  stripHtml,
  truncate,
  USER_AGENT,
} from "../fetch-helpers";
import type { FeedItem } from "../types";
import { attachHealth, healthDetail } from "../source-health";

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
  /** Real URL for link posts; "self"/"default"/"nsfw" placeholders otherwise. */
  thumbnail?: string;
}

interface RedditListing {
  data: { children: Array<{ data: RedditPost }> };
}

// Reddit's bot filter rejects requests that send `Accept: application/json`
// or omit Accept-Language.
const ANON_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

// If the HTML scrape gets challenged/walled, skip it for a while instead of
// burning a doomed request every fetch.
let htmlBlockedUntil = 0;

/** Reddit redirects a multireddit to this ordering (ASCII, capitals first);
 *  asking for it directly saves a request against a tight per-IP limit. */
const canonicalMulti = (subs: string) => subs.split("+").filter(Boolean).sort().join("+");

/**
 * The article behind a link post. Self posts point back to Reddit and media
 * posts to Reddit's own image and video hosts; neither is an outside source.
 */
export function redditOutboundLink(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const url = new URL(decodeEntities(value));
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (/(?:^|\.)(?:reddit\.com|redd\.it|redditmedia\.com|redditstatic\.com)$/i.test(url.hostname)) return undefined;
    return url.toString();
  } catch { return undefined; }
}

export const REDDIT_FEED_NOTICE = "Votes and comment counts are unavailable; showing Reddit's public feed order.";

export interface RedditGate {
  subs: string[];
  terms: string[];
}

export async function fetchReddit(
  {
    subs,
    subsB,
    gates = [],
    window = "day",
  }: { subs: string; subsB?: string; gates?: RedditGate[]; window?: "day" | "week" },
  fresh = false
): Promise<FeedItem[]> {
  const rv = fresh ? 0 : undefined;
  const t = window === "week" ? "week" : "day";

  // Gated intersection categories fetch each side as its own multireddit —
  // otherwise the high-volume side crowds the other out of the 100-slot ranking
  // before the gates even run.
  const multis = [subs, subsB].filter((m): m is string => Boolean(m));
  const results = await Promise.allSettled(multis.map((m) => fetchOneMulti(m, t, rv)));
  const fetched = results
    .filter((r): r is PromiseFulfilledResult<FeedItem[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);
  if (!fetched.length) {
    const firstErr = results.find((r) => r.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    throw firstErr?.reason instanceof Error ? firstErr.reason : new Error("Reddit fetch failed");
  }

  const seen = new Set<string>();
  const deduped = fetched.filter((it) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
  return attachHealth(diversify(applyGates(deduped, gates)), results.map((result, i) => {
    const detail = healthDetail(`Reddit ${multis[i]}`, result.status === "fulfilled" ? "ok" : "error");
    // The public feed still lists the day's top posts, so coverage is available,
    // but say plainly that nothing here carries a vote or comment count.
    const countless = result.status === "fulfilled" && result.value.every((item) => typeof item.score !== "number");
    return countless ? { ...detail, message: REDDIT_FEED_NOTICE } : detail;
  }));
}

/** OAuth (if creds) → HTML scrape (real scores, no key) → Atom fallback
 *  (hot-ranked but scoreless). Anonymous JSON is confirmed 403 — not attempted. */
async function fetchOneMulti(configured: string, t: string, rv?: number): Promise<FeedItem[]> {
  const subs = canonicalMulti(configured);
  const token = await getOauthToken();
  const attempts: Array<() => Promise<FeedItem[]>> = [];
  if (token) {
    attempts.push(async () =>
      mapListing(
        await fetchJson<RedditListing>(
          `https://oauth.reddit.com/r/${subs}/top?t=${t}&limit=100&raw_json=1`,
          { headers: { Authorization: `Bearer ${token}` }, revalidate: rv }
        )
      )
    );
  }
  if (Date.now() > htmlBlockedUntil) {
    attempts.push(async () => {
      try {
        return await fetchViaHtml(subs, t, rv);
      } catch (e) {
        // A 429 is IP-level rate limiting that persists — back off harder than
        // for a parse failure or transient error.
        const is429 = e instanceof Error && /\b429\b/.test(e.message);
        htmlBlockedUntil = Date.now() + (is429 ? 60 : 30) * 60_000;
        throw e;
      }
    });
  }
  attempts.push(() => fetchViaRss(subs, t, rv));

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

/**
 * Posts from gated subs must be topically relevant; ungated subs pass through.
 * Title hit, or two distinct hits in the body — a single incidental "AI" in a
 * 280-char excerpt let r/cybersecurity industry-ethics threads through.
 */
function applyGates(items: FeedItem[], gates: RedditGate[]): FeedItem[] {
  const active = gates
    .filter((g) => g.subs.length && g.terms.length)
    .map((g) => ({
      subs: new Set(g.subs.map((s) => s.toLowerCase())),
      matches: makeMatcher(g.terms),
    }));
  if (!active.length) return items;
  return items.filter((it) => {
    const sub = (it.sourceMeta ?? "").replace(/^r\//i, "").toLowerCase();
    return active.every((g) => !g.subs.has(sub) || g.matches(it.title, it.excerpt ?? ""));
  });
}

/**
 * A globally-ranked multireddit lets the highest-volume sub flood the column.
 * Interleave round-robin by subreddit (preserving Reddit's own in-sub order)
 * with a per-sub cap.
 */
function diversify(items: FeedItem[], cap = 12, size = 100): FeedItem[] {
  const groups = new Map<string, FeedItem[]>();
  for (const it of items) {
    const key = it.sourceMeta ?? "";
    const group = groups.get(key) ?? [];
    if (group.length < cap) {
      group.push(it);
      groups.set(key, group);
    }
  }
  const out: FeedItem[] = [];
  for (let round = 0; out.length < size; round++) {
    let added = false;
    for (const group of groups.values()) {
      if (group[round]) {
        out.push(group[round]);
        added = true;
        if (out.length >= size) break;
      }
    }
    if (!added) break;
  }
  return out;
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
        externalUrl: d.is_self ? undefined : redditOutboundLink(d.url),
        thumbnail: d.thumbnail?.startsWith("https://") ? d.thumbnail : undefined,
        score: d.score,
        comments: d.num_comments,
        author: d.author,
        timestamp: new Date(d.created_utc * 1000).toISOString(),
        excerpt: selftext ? truncate(selftext, 280) : undefined,
        sourceMeta: d.subreddit_name_prefixed,
      };
    });
}

/**
 * Multireddit URLs on www.reddit.com still render the legacy markup with full
 * `data-*` attributes (they were never migrated to the new frontend), which is
 * the only anonymous path that carries real scores + comment counts.
 * Single-sub URLs get a bot challenge — always use the `+` form.
 */
async function fetchViaHtml(subs: string, t: string, revalidate?: number): Promise<FeedItem[]> {
  const multi = subs.includes("+") ? subs : `${subs}+${subs}`;
  // Default cache is longer than other sources (600 vs 300) — halves the
  // request pressure on Reddit's per-IP rate limits.
  const html = await fetchText(`https://www.reddit.com/r/${multi}/top/?t=${t}&limit=100`, {
    headers: ANON_HEADERS,
    timeoutMs: 12_000,
    revalidate: revalidate ?? 600,
  });
  // Both the bot challenge and the login wall return HTTP 200 — detect by body.
  if (/Please wait for verification/i.test(html) || /\/login\/\?reason=/.test(html)) {
    throw new Error("Reddit served a bot challenge");
  }

  const tagRe = /<div[^>]*\bclass="([^"]*\bthing\b[^"]*)"[^>]*>/g;
  const found: Array<{ cls: string; attrs: Record<string, string>; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html))) {
    const attrs: Record<string, string> = {};
    for (const a of m[0].matchAll(/\s(data-[a-z0-9-]+)="([^"]*)"/g)) {
      attrs[a[1]] = decodeEntities(a[2]);
    }
    found.push({ cls: m[1], attrs, start: m.index, end: html.length });
  }
  found.forEach((f, i) => {
    if (i + 1 < found.length) f.end = found[i + 1].start;
  });

  const items: FeedItem[] = [];
  for (const { cls, attrs, start, end } of found) {
    const fullname = attrs["data-fullname"];
    if (!fullname?.startsWith("t3_")) continue;
    if (/\bstickied\b/.test(cls)) continue;
    if (attrs["data-promoted"] === "true" || attrs["data-nsfw"] === "true") continue;

    const block = html.slice(start, end);
    const titleMatch = /<a[^>]*\bclass="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    const title = titleMatch ? stripHtml(titleMatch[1]) : "";
    if (!title || !attrs["data-permalink"]) continue;

    // Thumbnail img inside the thing block; src is protocol-relative.
    const thumbMatch = /<a[^>]*\bclass="[^"]*\bthumbnail\b[^"]*"[^>]*>\s*<img[^>]*\bsrc="([^"]+)"/.exec(block);
    const rawThumb = thumbMatch?.[1];
    const thumbnail = rawThumb?.startsWith("//")
      ? `https:${rawThumb}`
      : rawThumb?.startsWith("https://")
        ? rawThumb
        : undefined;

    items.push({
      id: `reddit:${fullname.slice(3)}`,
      source: "reddit",
      title,
      url: `https://www.reddit.com${attrs["data-permalink"]}`,
      externalUrl: redditOutboundLink(attrs["data-url"]),
      thumbnail,
      score: Number(attrs["data-score"]) || 0,
      comments: Number(attrs["data-comments-count"]) || 0,
      author: attrs["data-author"] || undefined,
      timestamp: new Date(Number(attrs["data-timestamp"]) || 0).toISOString(),
      sourceMeta: attrs["data-subreddit-prefixed"] || undefined,
    });
  }
  // Zero parses = markup changed or an unrecognized wall — treat as failure so
  // the chain falls through to RSS.
  if (!items.length) throw new Error("Reddit HTML yielded no posts");
  return items;
}

async function fetchViaRss(subs: string, t: string, revalidate?: number): Promise<FeedItem[]> {
  const xml = await fetchText(`https://www.reddit.com/r/${subs}/top.rss?t=${t}&limit=100`, {
    headers: { ...ANON_HEADERS, Accept: "application/rss+xml, application/atom+xml, */*" },
    revalidate: revalidate ?? 600,
  });
  const parsed = await new Parser().parseString(xml);
  return mapRedditAtom(parsed.items ?? []);
}

interface AtomEntry { id?: string; title?: string; link?: string; content?: string; isoDate?: string; author?: string }

/**
 * The public feed carries no votes or comment counts, but it is ordered by the
 * day's top score and each entry's body links the article behind a link post.
 * Keep both: the link lets a post join its story across sources, and the list
 * position stands in for popularity without inventing a number.
 */
export function mapRedditAtom(entries: AtomEntry[]): FeedItem[] {
  const usable = entries
    .filter((item) => item.title && item.link?.startsWith("http"))
    .filter((item) => !/^(mentorship monday|weekly.*thread)/i.test(item.title ?? ""));
  return usable.map((item, index) => {
    const content = item.content ?? "";
    const sub = /\/r\/([^/]+)\//.exec(item.link ?? "")?.[1];
    const body = stripHtml(content)
      .replace(/submitted by\s.*$/i, "")
      .replace(/\[link\]|\[comments\]/gi, "")
      .trim();
    const thumbnail = /<img[^>]*\bsrc="(https:\/\/[^"]+)"/i.exec(content)?.[1];
    return {
      id: `reddit:${item.id ?? item.link}`,
      source: "reddit" as const,
      title: (item.title ?? "").trim(),
      url: item.link as string,
      externalUrl: redditOutboundLink(/<a\s[^>]*\bhref="([^"]+)"[^>]*>\s*\[link\]\s*<\/a>/i.exec(content)?.[1]),
      thumbnail: thumbnail && thumbnail.length <= 2048 ? decodeEntities(thumbnail) : undefined,
      author: item.author?.replace(/^\/u\//, ""),
      timestamp: item.isoDate ?? new Date().toISOString(),
      excerpt: body ? truncate(body, 280) : undefined,
      sourceMeta: sub ? `r/${sub}` : undefined,
      ...(usable.length > 1 ? { sourceRank: 1 - index / (usable.length - 1) } : {}),
    };
  });
}
