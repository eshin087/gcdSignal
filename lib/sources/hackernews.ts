import { fetchJson } from "../fetch-helpers";
import type { FeedItem } from "../types";
import { attachHealth, healthDetail } from "../source-health";

interface AlgoliaHit {
  objectID: string;
  title: string | null;
  url: string | null;
  points: number | null;
  num_comments: number | null;
  author: string;
  created_at_i: number;
}

const API = "https://hn.algolia.com/api/v1/";
const FIELDS = "&attributesToRetrieve=title,url,points,num_comments,author,created_at_i";
/** Below this a story rarely held the front page; the live front page is requested separately. */
export const POPULAR_MIN_POINTS = 40;

/**
 * Algolia prefix-matches the last query word ("AI" → Airbus, Airbnb) and
 * indexes Show/Ask HN body text, which is how non-AI stories leaked in. Quote
 * the AI token so it must match as an exact word, and search titles/urls only.
 * The route-level relevance gate is the safety net for multi-word queries
 * Algolia satisfies on the generic word alone ("AI security" → "security").
 */
const exactAiWords = (q: string) => q.replace(/\b(AI|LLM)\b/g, '"$1"');

/** A stable five-minute boundary lets identical requests share the data cache. */
const weekAgo = () => Math.floor(Date.now() / 300_000) * 300 - 7 * 86400;

/** Provider rows are an external boundary: skip anything without an id, title or date. */
export function mapHackerNewsHits(hits: unknown): FeedItem[] {
  if (!Array.isArray(hits)) return [];
  const items: FeedItem[] = [];
  for (const value of hits as Array<Partial<AlgoliaHit> | null>) {
    if (!value || typeof value.objectID !== "string" || typeof value.title !== "string" || !value.title ||
      typeof value.created_at_i !== "number" || !Number.isFinite(value.created_at_i)) continue;
    items.push({
      id: `hn:${value.objectID}`,
      source: "hackernews",
      title: value.title,
      url: `https://news.ycombinator.com/item?id=${value.objectID}`,
      externalUrl: typeof value.url === "string" && value.url.startsWith("http") ? value.url : undefined,
      score: typeof value.points === "number" ? value.points : 0,
      comments: typeof value.num_comments === "number" ? value.num_comments : 0,
      author: typeof value.author === "string" ? value.author : undefined,
      timestamp: new Date(value.created_at_i * 1000).toISOString(),
    });
  }
  return items;
}

/** One row per story across requests, most points first; ties go to the newer story. */
export function mergeHackerNews(lists: FeedItem[][]): FeedItem[] {
  const byId = new Map<string, FeedItem>();
  for (const item of lists.flat()) {
    const seen = byId.get(item.id);
    if (!seen || (item.score ?? 0) > (seen.score ?? 0)) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) ||
    Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.id.localeCompare(b.id));
}

/**
 * Built-in columns no longer ask Hacker News for a keyword. A single "AI" title
 * search never requested stories such as "Goldman Sachs is pulling Claude Code
 * from its bankers", so the built-in pool is every recent story that drew real
 * attention plus the live front page; the relevance gate and topic rules then
 * decide what is about AI. Topic columns also keep their keyword search so a
 * thin topic retains its older, quieter matches. A custom feed's explicit query
 * keeps its own scope.
 */
export async function fetchHackerNews(
  { q, topic }: { q?: string; topic?: string },
  fresh = false
): Promise<FeedItem[]> {
  const revalidate = fresh ? 0 : undefined;
  const request = async (path: string) =>
    mapHackerNewsHits((await fetchJson<{ hits?: unknown }>(API + path + FIELDS, { revalidate })).hits);
  const keywordSearch = (query: string) => request(
    `search?query=${encodeURIComponent(exactAiWords(query))}&tags=story&hitsPerPage=50` +
    `&numericFilters=created_at_i>${weekAgo()}&restrictSearchableAttributes=title,url&advancedSyntax=true`);
  if (q) return keywordSearch(q);

  const requests: Array<[string, () => Promise<FeedItem[]>]> = [
    ["Hacker News popular stories", () => request(
      `search_by_date?tags=story&hitsPerPage=1000&numericFilters=created_at_i>${weekAgo()},points>=${POPULAR_MIN_POINTS}`)],
    ["Hacker News front page", () => request("search?tags=front_page&hitsPerPage=60")],
  ];
  if (topic) requests.push(["Hacker News topic search", () => keywordSearch(topic)]);

  const settled = await Promise.allSettled(requests.map(([, run]) => run()));
  const lists = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (!lists.length) {
    const failure = settled.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
    throw failure?.reason instanceof Error ? failure.reason : new Error("Hacker News unavailable");
  }
  return attachHealth(mergeHackerNews(lists), settled.map((result, index) =>
    healthDetail(requests[index][0], result.status === "fulfilled" ? "ok" : "error")));
}
