import Parser from "rss-parser";
import { fetchText, makeMatcher, stripHtml, truncate } from "../fetch-helpers";
import { AI_TERMS } from "../categories";
import type { CategoryId, FeedItem } from "../types";

export interface RssFeedDef {
  label: string;
  url: string;
  /** Per-feed gate (title-or-2-body). */
  keywords?: string[];
  /** Restrict this feed to specific categories; absent = all categories. */
  categories?: CategoryId[];
}

export const RSS_FEEDS: RssFeedDef[] = [
  { label: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { label: "The Verge AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { label: "Ars Technica AI", url: "https://arstechnica.com/ai/feed/" },
  { label: "MIT Tech Review", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed" },
  { label: "The Decoder", url: "https://the-decoder.com/feed/" },
  { label: "Simon Willison", url: "https://simonwillison.net/atom/everything/" },
  { label: "Wired AI", url: "https://www.wired.com/feed/tag/ai/latest/rss" },
  { label: "The Register AI", url: "https://www.theregister.com/software/ai_ml/headlines.atom" },
  { label: "ZDNet AI", url: "https://www.zdnet.com/topic/artificial-intelligence/rss.xml" },
  { label: "IEEE Spectrum", url: "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss" },
  { label: "Hugging Face", url: "https://huggingface.co/blog/feed.xml" },
  { label: "Google AI", url: "https://blog.google/technology/ai/rss/" },
  {
    label: "404 Media",
    url: "https://www.404media.co/rss/",
    // Site-wide feed — keep only AI coverage.
    keywords: [
      "ai", "artificial intelligence", "llm", "chatbot", "openai", "anthropic",
      "machine learning", "deepfake", "model",
    ],
  },
  { label: "TechRadar AI", url: "https://www.techradar.com/feeds/tag/artificial-intelligence" },
  // Security-category bonus outlets — site-wide feeds, so each is AI-gated.
  { label: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews", keywords: AI_TERMS, categories: ["security"] },
  { label: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/", keywords: AI_TERMS, categories: ["security"] },
  { label: "Krebs on Security", url: "https://krebsonsecurity.com/feed/", keywords: AI_TERMS, categories: ["security"] },
  { label: "Schneier", url: "https://www.schneier.com/feed/atom/", keywords: AI_TERMS, categories: ["security"] },
  { label: "Dark Reading", url: "https://www.darkreading.com/rss.xml", keywords: AI_TERMS, categories: ["security"] },
];

// Custom fields expose media thumbnails (attrs land under `$` in rss-parser).
const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail"],
    ],
  },
});

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
  return candidates.find((c) => typeof c === "string" && c.startsWith("https://"));
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
  const results = await Promise.allSettled(
    feeds.map(async (f): Promise<FeedItem[]> => {
      // Fetch ourselves (Next data cache + timeout), then parse — parseURL would bypass both.
      const xml = await fetchText(f.url, {
        timeoutMs: 6000,
        revalidate: fresh ? 0 : undefined,
        headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
      });
      const parsed = await parser.parseString(xml);
      const feedLabel = f.label || parsed.title || new URL(f.url).hostname;
      const feedFilter = makeMatcher(f.keywords ?? []);
      return (parsed.items ?? [])
        .filter((item) => item.title && item.link?.startsWith("http"))
        .filter((item) => feedFilter(item.title ?? "", item.contentSnippet ?? ""))
        // Sort by date BEFORE capping — some feeds return hundreds of items in
        // arbitrary document order.
        .sort((a, b) => Date.parse(b.isoDate ?? b.pubDate ?? "") - Date.parse(a.isoDate ?? a.pubDate ?? ""))
        .slice(0, 8)
        .map((item) => {
          const excerpt = stripHtml(item.contentSnippet ?? item.content ?? "");
          const ts = item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : "");
          return {
            id: `rss:${item.guid ?? item.link}`,
            source: "rss" as const,
            title: (item.title ?? "").trim(),
            url: item.link as string,
            thumbnail: extractThumbnail(item as Parameters<typeof extractThumbnail>[0]),
            author: item.creator ?? undefined,
            timestamp: ts || new Date(0).toISOString(),
            excerpt: excerpt ? truncate(excerpt, 280) : undefined,
            sourceMeta: feedLabel,
          };
        });
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

  const matches = makeMatcher(keywords);
  const seen = new Set<string>();
  const floor = Date.now() - 7 * 86400_000; // recency floor — round-robin must not resurrect stale posts
  const candidates = fulfilled
    .flatMap((r) => r.value)
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return Date.parse(item.timestamp) > floor && matches(item.title, item.excerpt ?? "");
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
  return out;
}
