import { fetchJson, truncate } from "../fetch-helpers";
import type { FeedItem } from "../types";

interface Repo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics?: string[];
  pushed_at: string;
  owner?: { login?: string };
}

/**
 * Recently-active AI repos ranked by stars. Unauthenticated search allows
 * 10 req/min — comfortably within the 5-min cache at 6 category queries.
 */
export async function fetchGitHub({ q }: { q: string }, fresh = false): Promise<FeedItem[]> {
  const pushedAfter = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const query = `${q} pushed:>${pushedAfter}`;
  const data = await fetchJson<{ items?: Repo[] }>(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}` +
      `&sort=stars&order=desc&per_page=25`,
    {
      headers: { Accept: "application/vnd.github+json" },
      revalidate: fresh ? 0 : undefined,
    }
  );
  return (data.items ?? []).map((r) => ({
    id: `gh:${r.full_name}`,
    source: "github" as const,
    title: r.full_name,
    url: r.html_url,
    score: r.stargazers_count,
    author: r.owner?.login,
    timestamp: r.pushed_at,
    excerpt: r.description ? truncate(r.description, 200) : undefined,
    sourceMeta: r.language ?? r.topics?.[0] ?? undefined,
  }));
}
