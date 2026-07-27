import Parser from "rss-parser";
import { fetchJson, fetchText, makeMatcher, truncate } from "../fetch-helpers";
import type { FeedItem } from "../types";

interface HfPaper {
  paper?: {
    id?: string;
    title?: string;
    summary?: string;
    upvotes?: number;
    organization?: string;
    authors?: Array<{ name?: string }>;
  };
  publishedAt?: string;
  numComments?: number;
  thumbnail?: string;
}

/**
 * Hugging Face daily papers first (community-ranked: upvotes + comments), then
 * recent arXiv fills the tail. arXiv rate-limits hard (429→503 streaks) — it is
 * strictly best-effort and must never fail the column.
 */
export async function fetchPapers(
  { keywords = [] }: { keywords?: string[] },
  fresh = false
): Promise<FeedItem[]> {
  const rv = fresh ? 0 : undefined;
  const [hfResult, arxivResult] = await Promise.allSettled([
    fetchHf(rv),
    fetchArxiv(rv),
  ]);

  const hf = hfResult.status === "fulfilled" ? hfResult.value : [];
  const arxiv = arxivResult.status === "fulfilled" ? arxivResult.value : [];
  if (!hf.length && !arxiv.length) {
    const reason = hfResult.status === "rejected" ? hfResult.reason : undefined;
    throw reason instanceof Error ? reason : new Error("Paper sources unavailable");
  }

  // Dedupe by arXiv id — HF wins (it has engagement metrics).
  const seen = new Set(hf.map((p) => arxivKey(p.id)));
  const merged = [...hf, ...arxiv.filter((p) => !seen.has(arxivKey(p.id)))];

  const matches = makeMatcher(keywords);
  return merged.filter((p) => matches(p.title, p.excerpt ?? "")).slice(0, 60);
}

const arxivKey = (id: string) => id.replace(/^(hf|arxiv):/, "");

async function fetchHf(revalidate?: number): Promise<FeedItem[]> {
  const papers = await fetchJson<HfPaper[]>("https://huggingface.co/api/daily_papers?limit=50", {
    revalidate,
  });
  return papers
    .filter((p) => p.paper?.id && p.paper.title)
    .map((p) => ({
      id: `hf:${p.paper!.id}`,
      source: "papers" as const,
      title: p.paper!.title as string,
      url: `https://huggingface.co/papers/${p.paper!.id}`,
      externalUrl: `https://arxiv.org/abs/${p.paper!.id}`,
      thumbnail:
        typeof p.thumbnail === "string" && p.thumbnail.startsWith("https://")
          ? p.thumbnail
          : undefined,
      score: p.paper!.upvotes ?? 0,
      comments: p.numComments ?? 0,
      author: p.paper!.organization ?? p.paper!.authors?.[0]?.name,
      timestamp: p.publishedAt ?? new Date().toISOString(),
      excerpt: p.paper!.summary ? truncate(p.paper!.summary.replace(/\s+/g, " "), 240) : undefined,
      // These are all arXiv papers — HF just supplies the community engagement.
      sourceMeta: "arXiv",
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

async function fetchArxiv(revalidate?: number): Promise<FeedItem[]> {
  const xml = await fetchText(
    "http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL" +
      "&start=0&max_results=40&sortBy=submittedDate&sortOrder=descending",
    { timeoutMs: 8000, revalidate }
  );
  const parsed = await new Parser().parseString(xml);
  return (parsed.items ?? [])
    .filter((item) => item.title && item.link?.startsWith("http"))
    .map((item) => {
      const shortId = item.link!.split("/abs/")[1] ?? item.link!;
      return {
        id: `arxiv:${shortId}`,
        source: "papers" as const,
        title: (item.title ?? "").replace(/\s+/g, " ").trim(),
        url: item.link as string,
        timestamp: item.isoDate ?? new Date().toISOString(),
        excerpt: item.contentSnippet ? truncate(item.contentSnippet.replace(/\s+/g, " "), 240) : undefined,
        sourceMeta: "arXiv",
      };
    });
}
