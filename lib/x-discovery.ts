import Parser from "rss-parser";
import { decodeEntities, stripHtml, truncate } from "./fetch-helpers";
import { recallGood, rememberGood } from "./last-good";
import { applyRelevance } from "./relevance";
import { safeFeedText, FEED_MAX_BYTES } from "./safe-fetch";
import { sharedServerLoad, SERVER_CACHE_MS } from "./server-cache";
import { summarizeHealth } from "./source-health";
import type { SourceHealth } from "./types";
import type { XDiscoveryMention, XDiscoveryPost, XDiscoveryResponse } from "./x-discovery-types";

const WEEK_MS = 7 * 86400_000;
const LATENT_FEED = "https://www.latent.space/feed";
const SPONSOR = /\b(?:sponsored|sponsor(?:ship)?|advertisement|partner content|paid promotion|brought to you by|presented by)\b/i;

export interface XDiscoveryCandidate {
  id: string;
  url: string;
  author: string;
  title: string;
  mention: XDiscoveryMention;
}

const text = (value: unknown, max: number): string => typeof value === "string"
  ? truncate(stripHtml(value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")), max) : "";
const metric = (value: unknown): number | undefined => typeof value === "number" &&
  Number.isSafeInteger(value) && value >= 0 ? value : undefined;

function sharedDate(value: unknown, now: number): string | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > now - WEEK_MS && time <= now + 300_000
    ? new Date(time).toISOString() : null;
}

export function normalizeDiscoveredXPost(value: unknown): Pick<XDiscoveryCandidate, "id" | "url" | "author"> | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(decodeEntities(value));
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port ||
      !["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/([a-zA-Z0-9_]{1,15})\/status\/([1-9]\d{0,24})(?:\/(?:photo|video)\/[1-4])?\/?$/);
    if (!match) return null;
    return { id: match[2], author: match[1], url: `https://x.com/${match[1]}/status/${match[2]}` };
  } catch { return null; }
}

/** Only the local editorial context can establish AI relevance. No body fallback. */
function relevant(title: string, postUrl: string, sharedAt: string): boolean {
  if (!title || SPONSOR.test(title)) return false;
  return applyRelevance("hackernews", [{ id: "x-context", source: "hackernews", title,
    url: postUrl, timestamp: sharedAt }]).length > 0;
}

export function parseHackerNewsDiscovery(payload: unknown, now = Date.now()): XDiscoveryCandidate[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { hits?: unknown }).hits)) {
    throw new Error("Invalid Hacker News response");
  }
  const output: XDiscoveryCandidate[] = [];
  for (const value of (payload as { hits: unknown[] }).hits.slice(0, 100)) {
    if (!value || typeof value !== "object") continue;
    const hit = value as Record<string, unknown>;
    const post = normalizeDiscoveredXPost(hit.url);
    if (!post || typeof hit.objectID !== "string" || !/^[1-9]\d{0,24}$/.test(hit.objectID) ||
      typeof hit.created_at_i !== "number" || !Number.isSafeInteger(hit.created_at_i)) continue;
    const milliseconds = hit.created_at_i * 1000;
    if (!Number.isFinite(milliseconds) || milliseconds <= now - WEEK_MS || milliseconds > now + 300_000) continue;
    const sharedAt = new Date(milliseconds).toISOString();
    const title = text(hit.title, 280);
    if (!relevant(title, post.url, sharedAt)) continue;
    output.push({ ...post, title, mention: { source: "hackernews",
      sourceUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`, sourceTitle: title, sharedAt,
      ...(metric(hit.points) !== undefined ? { points: metric(hit.points) } : {}),
      ...(metric(hit.num_comments) !== undefined ? { comments: metric(hit.num_comments) } : {}) } });
  }
  return output;
}

const rssParser = new Parser({
  customFields: { item: [["content:encoded", "contentEncoded"]] },
  xml2js: { valueProcessors: [(value: string, name: string) =>
    (name === "published" || name === "updated") && !Number.isFinite(Date.parse(value))
      ? "1970-01-01T00:00:00.000Z" : value] },
});

function latentArticle(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !["www.latent.space", "latent.space"].includes(url.hostname) || !/^\/p\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) return null;
    return `https://www.latent.space${url.pathname.replace(/\/$/, "")}`;
  } catch { return null; }
}

export async function parseLatentSpaceDiscovery(xml: string, now = Date.now()): Promise<XDiscoveryCandidate[]> {
  if (Buffer.byteLength(xml) > FEED_MAX_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Unsupported discovery feed");
  const parsed = await rssParser.parseString(xml);
  const output: XDiscoveryCandidate[] = [];
  for (const entry of (parsed.items ?? []).slice(0, 30)) {
    const sourceUrl = latentArticle(entry.link);
    const sharedAt = sharedDate(entry.isoDate ?? entry.pubDate, now);
    const sourceTitle = text(entry.title, 200);
    if (!sourceUrl || !sharedAt || !sourceTitle || SPONSOR.test(sourceTitle)) continue;
    const body = typeof entry.contentEncoded === "string" ? entry.contentEncoded : entry.content;
    if (typeof body !== "string") continue;
    // Deliberately keep paragraph boundaries; a newsletter's AI heading must
    // not qualify unrelated links, sponsor blocks or account profile links.
    const html = body.replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
    const seen = new Set<string>();
    let paragraphCount = 0;
    for (const paragraph of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)) {
      if (++paragraphCount > 400 || output.length >= 160) break;
      const fragment = paragraph[1];
      if (fragment.length > 6000) continue;
      const context = text(fragment, 1200);
      if (!context || SPONSOR.test(context)) continue;
      const links = new Map<string, NonNullable<ReturnType<typeof normalizeDiscoveredXPost>>>();
      for (const anchor of fragment.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>/gi)) {
        const post = normalizeDiscoveredXPost(anchor[2]);
        if (post) links.set(post.id, post);
      }
      // A recap paragraph often cites several conflicting claims/authors.
      // Without their actual post text, attributing its headline to each is unsafe.
      if (links.size !== 1) continue;
      const post = [...links.values()][0];
      if (seen.has(post.id) || !relevant(context, post.url, sharedAt)) continue;
      seen.add(post.id);
      output.push({ ...post, title: truncate(context, 220),
        mention: { source: "latent-space", sourceUrl, sourceTitle, sharedAt } });
    }
  }
  return output;
}

export function rankXDiscovery(candidates: XDiscoveryCandidate[], now = Date.now()): XDiscoveryPost[] {
  const groups = new Map<string, XDiscoveryPost>();
  const representatives = new Map<string, XDiscoveryCandidate>();
  const compareCandidate = (a: XDiscoveryCandidate, b: XDiscoveryCandidate) =>
    Number(b.mention.source === "hackernews") - Number(a.mention.source === "hackernews") ||
    (b.mention.points ?? 0) - (a.mention.points ?? 0) ||
    (b.mention.comments ?? 0) - (a.mention.comments ?? 0) ||
    b.mention.sharedAt.localeCompare(a.mention.sharedAt) || a.title.localeCompare(b.title) || a.url.localeCompare(b.url);
  for (const candidate of candidates) {
    if (!sharedDate(candidate.mention.sharedAt, now)) continue;
    const existing = groups.get(candidate.id);
    if (!existing) {
      groups.set(candidate.id, { id: candidate.id, url: candidate.url, author: candidate.author,
        title: candidate.title, sharedAt: candidate.mention.sharedAt, mentions: [{ ...candidate.mention }], reasons: [], rank: 0 });
      representatives.set(candidate.id, candidate);
      continue;
    }
    const previous = existing.mentions.find((mention) => mention.sourceUrl === candidate.mention.sourceUrl);
    if (previous) {
      if (candidate.mention.points !== undefined) previous.points = Math.max(previous.points ?? 0, candidate.mention.points);
      if (candidate.mention.comments !== undefined) previous.comments = Math.max(previous.comments ?? 0, candidate.mention.comments);
    } else if (existing.mentions.length < 12) existing.mentions.push({ ...candidate.mention });
    if (candidate.mention.sharedAt > existing.sharedAt) existing.sharedAt = candidate.mention.sharedAt;
    const representative = representatives.get(candidate.id) as XDiscoveryCandidate;
    if (compareCandidate(candidate, representative) < 0) {
      existing.title = candidate.title;
      existing.url = candidate.url;
      existing.author = candidate.author;
      representatives.set(candidate.id, candidate);
    }
  }
  for (const post of groups.values()) {
    const hn = post.mentions.filter((mention) => mention.source === "hackernews");
    const points = Math.max(0, ...hn.map((mention) => mention.points ?? 0));
    const comments = Math.max(0, ...hn.map((mention) => mention.comments ?? 0));
    const sources = new Set(post.mentions.map((mention) => mention.source));
    const ageHours = Math.max(0, (now - Date.parse(post.sharedAt)) / 3600_000);
    // These are public-source attention signals. No X likes, views, original
    // post timestamps or rate-of-growth data are available from this loader.
    post.rank = Math.round(1000 * (1 + Math.min(4, Math.log1p(points) / 2) +
      Math.min(2, Math.log1p(comments) / 3) + (sources.size > 1 ? 1 : 0)) / (1 + ageHours / 24));
    post.reasons = [
      ...(hn.length ? ["Shared on Hacker News"] : []),
      ...(sources.has("latent-space") ? ["Selected in Latent Space"] : []),
      ...(points > 0 ? [`${points} HN points`] : []),
      ...(sources.size > 1 ? ["Linked by two public sources"] : []),
    ];
    post.mentions.sort((a, b) => b.sharedAt.localeCompare(a.sharedAt));
  }
  const remaining = [...groups.values()].sort((a, b) => b.rank - a.rank || b.sharedAt.localeCompare(a.sharedAt) || a.id.localeCompare(b.id));
  const ranked: XDiscoveryPost[] = [];
  const authorCounts = new Map<string, number>();
  while (remaining.length && ranked.length < 80) {
    const diverse = ranked.length < 20 ? remaining.findIndex((post) => (authorCounts.get(post.author.toLowerCase()) ?? 0) < 2) : 0;
    const [post] = remaining.splice(Math.max(0, diverse), 1);
    ranked.push(post);
    const author = post.author.toLowerCase();
    authorCounts.set(author, (authorCounts.get(author) ?? 0) + 1);
  }
  return ranked;
}

interface Snapshot { candidates: XDiscoveryCandidate[]; fetchedAt: string }
interface SourceResult extends Snapshot { health: SourceHealth }

function unavailableSource(id: string, checkedAt = new Date().toISOString()): SourceResult {
  const previous = recallGood<Snapshot>(`x-discovery:v1:${id}`);
  return { candidates: previous?.value.candidates ?? [], fetchedAt: previous?.value.fetchedAt ?? checkedAt,
    health: { id, status: previous ? "stale" : "error", checkedAt,
      ...(previous ? { lastSuccessAt: previous.value.fetchedAt } : {}),
      message: previous ? "Showing previous successful data" : "Public source temporarily unavailable" } };
}

function sourceLoad(id: string, loader: () => Promise<XDiscoveryCandidate[]>): Promise<SourceResult> {
  const key = `x-discovery:v1:${id}`;
  return sharedServerLoad(key, async () => {
    const checkedAt = new Date().toISOString();
    try {
      const snapshot = { candidates: await loader(), fetchedAt: checkedAt };
      rememberGood(key, snapshot);
      return { ...snapshot, health: { id, status: "ok" as const, checkedAt, lastSuccessAt: checkedAt } };
    } catch {
      return unavailableSource(id, checkedAt);
    }
  }, SERVER_CACHE_MS);
}

/** Fixed public sources only. Requests have no user-supplied URLs or bypass. */
export async function loadXDiscovery(): Promise<XDiscoveryResponse> {
  const ids = ["hackernews:twitter.com", "hackernews:x.com", "latent-space"];
  const settled = await Promise.allSettled([
    ...["twitter.com", "x.com"].map((domain) => sourceLoad(`hackernews:${domain}`, async () => {
      const since = Math.floor(Date.now() / SERVER_CACHE_MS) * 300 - 7 * 86400;
      const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(domain)}` +
        `&tags=story&restrictSearchableAttributes=url&hitsPerPage=100&numericFilters=created_at_i>${since}`;
      // The safe transport caps duration/body/concurrency and validates every
      // redirect/DNS destination. Algolia also accepts its RSS Accept header.
      return parseHackerNewsDiscovery(JSON.parse(await safeFeedText(url)));
    })),
    sourceLoad("latent-space", async () => parseLatentSpaceDiscovery(await safeFeedText(LATENT_FEED))),
  ]);
  const results = settled.map((result, index) => result.status === "fulfilled" ? result.value : unavailableSource(ids[index]));
  const health = summarizeHealth(results.map((result) => result.health));
  const items = rankXDiscovery(results.flatMap((result) => result.candidates));
  const retrievedTimes = results.filter((result) => result.health.status !== "error").map((result) => result.fetchedAt);
  const fetchedAt = retrievedTimes.sort().at(-1) ?? results[0].fetchedAt;
  return { schemaVersion: 1, items, fetchedAt, health,
    ...(health.degraded ? { stale: results.some((result) => result.health.status === "stale"),
      error: health.succeeded === 0 ? "Public discovery sources are temporarily unavailable" : "Some public discovery sources are unavailable" } : {}) };
}
