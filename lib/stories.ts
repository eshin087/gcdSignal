import { isPrimarySource } from "./curation";
import type { FeedItem, SourceId } from "./types";

/** Remove tracking, preserving parameters that identify articles and videos. */
export function canonicalUrl(value: string): string {
  try {
    const u = new URL(value);
    u.hash = "";
    u.hostname = u.hostname.replace(/^www\./, "").toLowerCase();
    for (const key of [...u.searchParams.keys()]) if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) u.searchParams.delete(key);
    if (u.hostname === "youtu.be") return "https://youtube.com/watch?v=" + encodeURIComponent(u.pathname.slice(1));
    if (u.hostname === "youtube.com" && u.pathname === "/watch" && u.searchParams.has("v")) return "https://youtube.com/watch?v=" + encodeURIComponent(u.searchParams.get("v")!);
    u.searchParams.sort();
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch { return value; }
}

const socialHosts = new Set(["reddit.com", "old.reddit.com", "news.ycombinator.com", "bsky.app", "x.com", "twitter.com", "youtube.com", "youtu.be", "4chan.org"]);
const socialSources = new Set<SourceId>(["reddit", "hackernews", "bluesky", "youtube", "fourchan"]);
const hostname = (value: string) => {
  try { return new URL(value).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
};

/** A linked article is one reporting origin even when many platforms repost it. */
export function reportingPublisher(item: FeedItem): string | null {
  const external = item.externalUrl && hostname(item.externalUrl);
  if (external && !socialHosts.has(external)) return external;
  if (item.source === "rss" || item.source === "papers") return hostname(item.externalUrl ?? item.url);
  if (item.source === "youtube" && isPrimarySource(item)) return (item.author ?? item.sourceMeta ?? "Official channel").trim().toLowerCase();
  return null;
}

export function discussionPlatform(item: FeedItem): SourceId | null {
  return socialSources.has(item.source) ? item.source : null;
}

/** Compatibility label for source display only; do not treat platforms as reporting. */
export function publisher(item: FeedItem): string {
  return reportingPublisher(item) ?? item.source;
}

type StoryIdentityItem = Pick<FeedItem, "source" | "id" | "url" | "externalUrl" | "title">;
/** Stable across source IDs, tracking and query order for a shared article URL.
 * Mark every member identity read: a newly chosen cluster representative should
 * not resurrect a story. Similar but independently written articles keep aliases.
 */
export function stableStoryId(item: StoryIdentityItem): string {
  const url = canonicalUrl(item.externalUrl ?? item.url);
  let identity = item.source + ":" + item.id;
  try {
    const u = new URL(url);
    if (["http:", "https:"].includes(u.protocol) && (u.pathname !== "/" || u.search)) {
      identity = url;
      // Evergreen release indexes reuse one URL for genuinely different
      // versions. Ordinary article/repost links still dedupe by URL alone.
      if (/(?:^|\/)(?:changelog|release[-_]?notes|updates|releases)(?:\.(?:html?|md))?\/?$/i.test(u.pathname)) {
        const version = [...new Set(versions(item.title))].sort().join(",");
        if (version) identity += "|version:" + version;
      }
    }
  } catch { /* old imported items retain their source identity */ }
  // FNV-1a 64-bit: compact, deterministic in server and browser, no secret state.
  let hash = BigInt("14695981039346656037");
  for (const char of identity) hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0)!)) * BigInt("1099511628211"));
  return "story:" + hash.toString(16).padStart(16, "0");
}

const STOP = new Set("the a an and or of to in on for with is are was be been its it at by as from how why what when where who which than then that this these not but has have had will can could would should may might you your we our they their his her says said announces announced launches launched releases released release launch introduces unveils now just over about into more most up out vs amid report reportedly using use used against during between while some all one two new first get gets got make makes made do does did here there still no yes so if because before off back ai artificial intelligence model models".split(" "));
const tokens = (title: string) => new Set(title.toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9.-]+/).filter((t) => t.length >= 3 && !STOP.has(t)));
const versions = (title: string): string[] => {
  const text = title.toLowerCase();
  const found = text.match(/\b(?:gpt|claude|qwen|gemini|llama|mistral|grok|deepseek|vllm|python|pytorch|opus|sonnet|haiku)[- ]*(?:opus[- ]*|sonnet[- ]*|haiku[- ]*)?\d+(?:\.\d+)*\b|\bv?\d+\.\d+(?:\.\d+)*\b/g) ?? [];
  return found.map((v) => v.replace(/[- ]+/g, "").replace(/^v(?=\d)/, ""));
};
const entityPatterns = [
  ["openai", /\b(?:openai|chatgpt|gpt[- ]?\d|sora)\b/i],
  ["anthropic", /\b(?:anthropic|claude|amodei)\b/i],
  ["google", /\b(?:google|deepmind|gemini)\b/i],
  ["meta", /\b(?:meta|llama|zuckerberg)\b/i],
  ["microsoft", /\b(?:microsoft|copilot)\b/i],
  ["mistral", /\bmistral\b/i],
  ["deepseek", /\bdeepseek\b/i],
  ["alibaba", /\b(?:alibaba|qwen)\b/i],
] as const;
const entities = (title: string) => new Set(entityPatterns.filter(([, pattern]) => pattern.test(title)).map(([entity]) => entity));
const eventType = (title: string) => {
  if (/\b(?:outage|offline|disruption|downtime)\b/i.test(title)) return "outage";
  if (/\b(?:funding|acquisition|acquires|investment|raises)\b/i.test(title)) return "finance";
  if (/\b(?:lawsuit|sues|court|ruling)\b/i.test(title)) return "legal";
  if (/\b(?:launch|launches|release|releases|introduces|announces|unveils)\b/i.test(title)) return "release";
  return null;
};

export function sameEvent(a: FeedItem, b: FeedItem): boolean {
  const au = canonicalUrl(a.externalUrl ?? a.url), bu = canonicalUrl(b.externalUrl ?? b.url);
  // Contradictory integer/decimal model versions must not collapse, even if an
  // evergreen changelog reuses its URL.
  const av = versions(a.title), bv = versions(b.title);
  if (av.length && bv.length && !av.some((v) => bv.includes(v))) return false;
  try { const u = new URL(au); if (au === bu && (u.pathname !== "/" || u.search)) return true; } catch { /* title comparison below */ }
  const aAt = Date.parse(a.timestamp), bAt = Date.parse(b.timestamp);
  if (!Number.isFinite(aAt) || !Number.isFinite(bAt) || Math.abs(aAt - bAt) > 48 * 3600000) return false;
  const ae = entities(a.title), be = entities(b.title);
  if (ae.size && be.size && ![...ae].some((entity) => be.has(entity))) return false;
  const actionA = eventType(a.title), actionB = eventType(b.title);
  if (actionA && actionB && actionA !== actionB) return false;
  const at = tokens(a.title), bt = tokens(b.title);
  if (!at.size || !bt.size) return false;
  const shared = [...at].filter((t) => bt.has(t)).length;
  return a.title.trim().toLowerCase() === b.title.trim().toLowerCase()
    || (shared >= 4 && shared / Math.min(at.size, bt.size) >= 0.55 && shared / new Set([...at, ...bt]).size >= 0.35);
}

export function groupStories(items: FeedItem[]): FeedItem[][] {
  const groups: FeedItem[][] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.source + ":" + item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    // Representative-only comparison prevents transitive A -> B -> C merges.
    const group = groups.find((g) => sameEvent(g[0], item));
    if (group) group.push(item);
    else groups.push([item]);
  }
  return groups;
}
