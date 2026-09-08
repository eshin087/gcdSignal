import Parser from "rss-parser";
import { fetchJson, fetchText, makeMatcher, truncate } from "../fetch-helpers";
import type { FeedItem } from "../types";
import { attachHealth, healthDetail } from "../source-health";

interface HfPaper {
  paper?: {
    id?: string;
    title?: string;
    summary?: string;
    upvotes?: number;
    organization?: string | { name?: string; fullname?: string };
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

  // Dedupe by arXiv id AND normalized title — HF wins (it has engagement
  // metrics). arXiv ids carry version suffixes (2607.24707v1) that HF omits,
  // which is how identical papers used to appear twice.
  const seenIds = new Set(hf.map((p) => arxivKey(p.id)));
  const seenTitles = new Set(hf.map((p) => titleKey(p.title)));
  const merged = [
    ...hf,
    ...arxiv.filter((p) => !seenIds.has(arxivKey(p.id)) && !seenTitles.has(titleKey(p.title))),
  ];

  const matches = makeMatcher(keywords);
  return attachHealth(merged.filter((p) => matches(p.title, p.excerpt ?? "")).slice(0, 60), [
    healthDetail("Hugging Face papers", hfResult.status === "fulfilled" ? "ok" : "error"),
    healthDetail("arXiv", arxivResult.status === "fulfilled" ? "ok" : "error"),
  ]);
}

const arxivKey = (id: string) => id.replace(/^(hf|arxiv):/, "").replace(/v\d+$/, "");
const titleKey = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** HF organization is an object on current responses, not always a string. */
export function normalizePaperAuthor(organization: unknown, fallback: unknown): string | undefined {
  const text = (value: unknown) => typeof value === "string" && value.trim() ? truncate(value.trim(), 120) : undefined;
  if (organization && typeof organization === "object") {
    const record = organization as { fullname?: unknown; name?: unknown };
    return text(record.fullname) ?? text(record.name) ?? text(fallback);
  }
  return text(organization) ?? text(fallback);
}

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
      author: normalizePaperAuthor(p.paper!.organization, p.paper!.authors?.[0]?.name),
      timestamp: p.publishedAt ?? new Date().toISOString(),
      excerpt: p.paper!.summary ? truncate(p.paper!.summary.replace(/\s+/g, " "), 240) : undefined,
      // These are all arXiv papers — HF just supplies the community engagement.
      sourceMeta: "arXiv",
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

async function fetchArxiv(revalidate?: number): Promise<FeedItem[]> {
  const xml = await fetchText(
    "https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL" +
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
