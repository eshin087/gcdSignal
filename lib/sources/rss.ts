import Parser from "rss-parser";
import { fetchText, keywordMatcher, stripHtml, truncate } from "../fetch-helpers";
import type { FeedItem } from "../types";

export const RSS_FEEDS: Array<{ label: string; url: string }> = [
  { label: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { label: "The Verge AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { label: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/" },
  { label: "Ars Technica AI", url: "https://arstechnica.com/ai/feed/" },
  { label: "MIT Tech Review", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed" },
  { label: "The Decoder", url: "https://the-decoder.com/feed/" },
  { label: "Simon Willison", url: "https://simonwillison.net/atom/everything/" },
];

const parser = new Parser();

export async function fetchRss({
  url,
  keywords,
}: {
  url?: string;
  keywords: string[];
}): Promise<FeedItem[]> {
  const feeds = url ? [{ label: "", url }] : RSS_FEEDS;
  const results = await Promise.allSettled(
    feeds.map(async (f): Promise<FeedItem[]> => {
      // Fetch ourselves (Next data cache + timeout), then parse — parseURL would bypass both.
      const xml = await fetchText(f.url, {
        timeoutMs: 6000,
        headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
      });
      const parsed = await parser.parseString(xml);
      const feedLabel = f.label || parsed.title || new URL(f.url).hostname;
      return (parsed.items ?? [])
        .filter((item) => item.title && item.link?.startsWith("http"))
        .slice(0, 15)
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

  const matches = keywordMatcher(keywords);
  const seen = new Set<string>();
  return fulfilled
    .flatMap((r) => r.value)
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return matches(`${item.title} ${item.excerpt ?? ""}`);
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, 30);
}
