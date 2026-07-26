import { fetchJson, keywordMatcher, stripHtml, truncate } from "../fetch-helpers";
import type { FeedItem } from "../types";

interface CatalogThread {
  no: number;
  sub?: string;
  com?: string;
  replies?: number;
  time: number;
  last_modified?: number;
}

interface CatalogPage {
  page: number;
  threads?: CatalogThread[];
}

export async function fetchFourchan({
  board,
  keywords,
}: {
  board: string;
  keywords: string[];
}): Promise<FeedItem[]> {
  const pages = await fetchJson<CatalogPage[]>(`https://a.4cdn.org/${board}/catalog.json`);
  const threads = pages.flatMap((p) => p.threads ?? []);
  const matches = keywordMatcher(keywords);
  return threads
    .filter((t) => matches(`${t.sub ?? ""} ${t.com ?? ""}`))
    .sort((a, b) => (b.replies ?? 0) - (a.replies ?? 0))
    .slice(0, 25)
    .map((t) => {
      const sub = t.sub ? stripHtml(t.sub) : "";
      const com = t.com ? stripHtml(t.com) : "";
      const title = sub || truncate(com, 100) || `Thread #${t.no}`;
      return {
        id: `4chan:${board}:${t.no}`,
        source: "fourchan" as const,
        title,
        url: `https://boards.4chan.org/${board}/thread/${t.no}`,
        score: t.replies ?? 0,
        comments: t.replies ?? 0,
        timestamp: new Date((t.last_modified ?? t.time) * 1000).toISOString(),
        excerpt: sub && com ? truncate(com, 280) : com.length > 100 ? truncate(com, 280) : undefined,
        sourceMeta: `/${board}/`,
      };
    });
}
