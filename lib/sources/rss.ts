import Parser from "rss-parser";
import { fetchText, makeMatcher, stripHtml, truncate } from "../fetch-helpers";
import type { FeedItem } from "../types";

export const RSS_FEEDS: Array<{ label: string; url: string; keywords?: string[] }> = [
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
];

const parser = new Parser();

export async function fetchRss(
  {
    url,
    keywords,
  }: {
    url?: string;
    keywords: string[];
  },
  fresh = false
): Promise<FeedItem[]> {
  const feeds = url ? [{ label: "", url }] : RSS_FEEDS;
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
      const feedFilter = makeMatcher("keywords" in f && f.keywords ? f.keywords : []);
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
  for (let round = 0; out.length < 40; round++) {
    const pass: FeedItem[] = [];
    for (const group of groups.values()) {
      if (group[round]) pass.push(group[round]);
    }
    if (!pass.length) break;
    pass.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    for (const item of pass) {
      out.push(item);
      if (out.length >= 40) break;
    }
  }
  return out;
}
