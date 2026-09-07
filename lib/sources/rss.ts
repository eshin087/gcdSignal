import Parser from "rss-parser";
import { makeMatcher, stripHtml, truncate } from "../fetch-helpers";
import { AI_TERMS } from "../categories";
import type { CategoryId, FeedItem } from "../types";
import { readCachedRssDocument, readRssDocument } from "../rss-fetch";
import { attachHealth, healthDetail, sourceHealth } from "../source-health";

export interface RssFeedDef {
  label: string;
  url: string;
  /** Per-feed gate (title-or-2-body). */
  keywords?: string[];
  /** Restrict this feed to specific categories; absent = all categories. */
  categories?: CategoryId[];
  /** Whole-site feed (not an AI section) — the relevance gate runs strict on these. */
  siteWide?: boolean;
}

export const RSS_FEEDS: RssFeedDef[] = [
  { label: "OpenAI", url: "https://openai.com/news/rss.xml" },
  { label: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { label: "The Verge AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { label: "Ars Technica AI", url: "https://arstechnica.com/ai/feed/" },
  { label: "MIT Tech Review", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed" },
  { label: "The Decoder", url: "https://the-decoder.com/feed/" },
  { label: "Simon Willison", url: "https://simonwillison.net/atom/everything/", siteWide: true },
  { label: "Wired AI", url: "https://www.wired.com/feed/tag/ai/latest/rss" },
  { label: "The Register AI", url: "https://www.theregister.com/software/ai_ml/headlines.atom" },
  { label: "ZDNet AI", url: "https://www.zdnet.com/topic/artificial-intelligence/rss.xml" },
  { label: "IEEE Spectrum", url: "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss" },
  { label: "Hugging Face", url: "https://huggingface.co/blog/feed.xml" },
  { label: "Google AI", url: "https://blog.google/innovation-and-ai/technology/ai/rss/" },
  {
    label: "404 Media",
    url: "https://www.404media.co/rss/",
    // Site-wide feed — keep only AI coverage.
    keywords: [
      "ai", "artificial intelligence", "llm", "chatbot", "openai", "anthropic",
      "machine learning", "deepfake", "model",
    ],
    siteWide: true,
  },
  { label: "TechRadar AI", url: "https://www.techradar.com/feeds/tag/artificial-intelligence" },
  // Security-category bonus outlets — site-wide feeds, so each is AI-gated.
  { label: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews", keywords: AI_TERMS, categories: ["security"], siteWide: true },
  { label: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/", keywords: AI_TERMS, categories: ["security"], siteWide: true },
  { label: "Krebs on Security", url: "https://krebsonsecurity.com/feed/", keywords: AI_TERMS, categories: ["security"], siteWide: true },
  { label: "Schneier", url: "https://www.schneier.com/feed/atom/", keywords: AI_TERMS, categories: ["security"], siteWide: true },
  { label: "Dark Reading", url: "https://www.darkreading.com/rss.xml", keywords: AI_TERMS, categories: ["security"], siteWide: true },
];

const SITE_WIDE_LABELS = new Set(RSS_FEEDS.filter((f) => f.siteWide).map((f) => f.label));

/** Whether an item's outlet label belongs to a whole-site (non-AI-section) feed. */
export const isSiteWideOutlet = (label: string): boolean => SITE_WIDE_LABELS.has(label);

// Custom fields expose media thumbnails (attrs land under `$` in rss-parser)
// and full article bodies (content:encoded) for read-time estimation.
const parser = new Parser({
  xml2js: {
    // rss-parser calls toISOString directly for Atom dates. Neutralize an
    // invalid date before that call so only this entry is dropped by recency.
    valueProcessors: [(value: string, name: string) =>
      (name === "published" || name === "updated") && !Number.isFinite(Date.parse(value))
        ? "1970-01-01T00:00:00.000Z" : value],
  },
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail"],
      ["content:encoded", "contentEncoded"],
    ],
  },
});

const READ_WPM = 225;
/** Below this the feed only carries a summary — a read-time would be a lie. */
const MIN_FULLTEXT_WORDS = 120;

/** Publishers may emit structured Atom authors inside RSS (Google does). */
export function normalizeRssAuthor(value: unknown, depth = 0): string | undefined {
  if (depth > 3) return undefined;
  if (typeof value === "string") return value.trim() ? truncate(stripHtml(value).trim(), 120) || undefined : undefined;
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 4)) {
      const author = normalizeRssAuthor(entry, depth + 1);
      if (author) return author;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["name", "_", "_text", "#text"]) {
      const author = normalizeRssAuthor(record[key], depth + 1);
      if (author) return author;
    }
  }
  return undefined;
}

function estimateReadMinutes(item: { contentEncoded?: string; content?: string }): number | undefined {
  const enc = item.contentEncoded ?? "";
  const raw = enc.length > (item.content ?? "").length ? enc : (item.content ?? "");
  if (!raw) return undefined;
  const words = stripHtml(raw).split(/\s+/).filter(Boolean).length;
  if (words < MIN_FULLTEXT_WORDS) return undefined;
  return Math.max(1, Math.round(words / READ_WPM));
}

interface MediaAttrs {
  $?: { url?: string; medium?: string; type?: string };
}

function extractThumbnail(item: {
  enclosure?: { url?: string; type?: string };
  mediaThumbnail?: MediaAttrs;
  mediaContent?: MediaAttrs[];
}): string | undefined {
  const candidates: Array<string | undefined> = [];
  const enc = item.enclosure;
  if (
    enc?.url &&
    (enc.type?.startsWith("image/") || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(enc.url))
  ) {
    candidates.push(enc.url);
  }
  candidates.push(item.mediaThumbnail?.$?.url);
  for (const mc of item.mediaContent ?? []) {
    if (mc?.$?.medium === "image" || mc?.$?.type?.startsWith("image/")) {
      candidates.push(mc.$.url);
    }
  }
  return candidates.find((c) => typeof c === "string" && c.length <= 2048 && c.startsWith("https://"));
}

export async function fetchRss(
  {
    url,
    keywords,
    category,
  }: {
    url?: string;
    keywords: string[];
    category?: string;
  },
  fresh = false
): Promise<FeedItem[]> {
  const feeds: RssFeedDef[] = url
    ? [{ label: "", url }]
    : RSS_FEEDS.filter((f) => !f.categories || (category && f.categories.includes(category as CategoryId)));
  const matches = makeMatcher(keywords);
  const results = await Promise.allSettled(
    feeds.map(async (f): Promise<FeedItem[]> => {
      // Every publisher uses pinned DNS/validated redirects. Only curated URLs
      // occupy Next's persistent cache; custom URLs use bounded route caching.
      const { xml, fetchedAt } = await (url || fresh ? readRssDocument(f.url) : readCachedRssDocument(f.url));
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Unsupported feed document");
      const parsed = await parser.parseString(xml);
      const feedLabel = truncate(f.label || parsed.title || new URL(f.url).hostname, 120);
      const feedFilter = makeMatcher(f.keywords ?? []);
      const items: FeedItem[] = (parsed.items ?? [])
        .filter((item) => item.title && item.link && item.link.length <= 2048 && /^https?:\/\//i.test(item.link))
        .map((item) => ({ item, time: Date.parse(item.isoDate ?? item.pubDate ?? ""), excerpt: stripHtml(item.contentSnippet ?? item.content ?? "") }))
        // Apply topic and date validity before the outlet cap. A publisher's
        // newer unrelated stories must not hide its older relevant coverage.
        .filter(({ item, time, excerpt }) => Number.isFinite(time) &&
          feedFilter(item.title ?? "", excerpt) && matches(item.title ?? "", excerpt))
        .sort((a, b) => b.time - a.time)
        .slice(0, 8)
        .map(({ item, time, excerpt }) => {
          return {
            id: `rss:${String(item.guid ?? item.link).slice(0, 2048)}`,
            source: "rss" as const,
            title: truncate((item.title ?? "").trim(), 500),
            url: item.link as string,
            thumbnail: extractThumbnail(item as Parameters<typeof extractThumbnail>[0]),
            author: normalizeRssAuthor(item.creator) ?? normalizeRssAuthor((item as { author?: unknown }).author),
            timestamp: new Date(time).toISOString(),
            excerpt: excerpt ? truncate(excerpt, 280) : undefined,
            sourceMeta: feedLabel,
            readMinutes: estimateReadMinutes(item as { contentEncoded?: string; content?: string }),
          };
        });
      const status = Date.now() - Date.parse(fetchedAt) >= 300_000 ? "stale" : "ok";
      return attachHealth(items, [{ ...healthDetail(feedLabel, status, fetchedAt), checkedAt: fetchedAt, lastSuccessAt: fetchedAt }]);
    })
  );
  const fulfilled = results.filter(
    (r): r is PromiseFulfilledResult<FeedItem[]> => r.status === "fulfilled"
  );
  if (!fulfilled.length) {
    const firstError = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    throw new Error(
      firstError?.reason instanceof Error ? firstError.reason.message : "All RSS feeds failed"
    );
  }

  const seen = new Set<string>();
  const floor = Date.now() - 7 * 86400_000; // recency floor — round-robin must not resurrect stale posts
  const candidates = fulfilled
    .flatMap((r) => r.value)
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return Date.parse(item.timestamp) > floor;
    });

  // Round-robin by outlet so high-frequency publishers can't crowd out the
  // rest: pass N takes each outlet's Nth-freshest, outlets within a pass
  // ordered by that item's recency.
  const groups = new Map<string, FeedItem[]>();
  for (const item of candidates) {
    const key = item.sourceMeta ?? "";
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  }

  const out: FeedItem[] = [];
  for (let round = 0; out.length < 100; round++) {
    const pass: FeedItem[] = [];
    for (const group of groups.values()) {
      if (group[round]) pass.push(group[round]);
    }
    if (!pass.length) break;
    pass.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    for (const item of pass) {
      out.push(item);
      if (out.length >= 100) break;
    }
  }
  return attachHealth(out, results.flatMap((result, i) => result.status === "fulfilled"
    ? sourceHealth(result.value, feeds[i].label || "Custom RSS").details ?? []
    : [healthDetail(feeds[i].label || "Custom RSS", "error")]));
}
