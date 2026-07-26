import { fetchJson, stripHtml, truncate } from "../fetch-helpers";
import type { FeedItem } from "../types";

interface MastoStatus {
  id: string;
  uri: string;
  url?: string;
  content?: string;
  created_at: string;
  favourites_count?: number;
  reblogs_count?: number;
  replies_count?: number;
  account?: { acct?: string; display_name?: string };
}

export async function fetchMastodon({
  tags,
  instance,
}: {
  tags: string[];
  instance: string;
}): Promise<FeedItem[]> {
  const [first, ...rest] = tags;
  const qs = new URLSearchParams({ limit: "25" });
  for (const t of rest) qs.append("any[]", t);
  const data = await fetchJson<MastoStatus[]>(
    `https://${instance}/api/v1/timelines/tag/${encodeURIComponent(first)}?${qs}`
  );
  return data
    .map((s) => {
      const text = stripHtml(s.content ?? "");
      const score = (s.favourites_count ?? 0) + (s.reblogs_count ?? 0);
      return {
        id: `masto:${instance}:${s.id}`,
        source: "mastodon" as const,
        title: truncate(text, 140) || "(media post)",
        url: s.url ?? s.uri,
        score,
        comments: s.replies_count ?? 0,
        author: s.account?.acct ? `@${s.account.acct}` : undefined,
        timestamp: s.created_at,
        excerpt: text.length > 140 ? truncate(text, 280) : undefined,
        sourceMeta: `#${first}`,
      };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
