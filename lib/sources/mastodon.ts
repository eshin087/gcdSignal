import { fetchJson, keywordMatcher, stripHtml, truncate } from "../fetch-helpers";
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

function toItem(s: MastoStatus, instance: string, meta: string): FeedItem {
  const text = stripHtml(s.content ?? "");
  return {
    id: `masto:${instance}:${s.id}`,
    source: "mastodon",
    title: truncate(text, 140) || "(media post)",
    url: s.url ?? s.uri,
    score: (s.favourites_count ?? 0) + (s.reblogs_count ?? 0),
    comments: s.replies_count ?? 0,
    author: s.account?.acct ? `@${s.account.acct}` : undefined,
    timestamp: s.created_at,
    excerpt: text.length > 140 ? truncate(text, 280) : undefined,
    sourceMeta: meta,
  };
}

/**
 * Tag timelines are chronological and mostly low-engagement, so we blend in the
 * instance's actual trending posts (keyword-filtered to the category) and rank
 * everything by engagement.
 */
export async function fetchMastodon({
  tags,
  instance,
}: {
  tags: string[];
  instance: string;
}): Promise<FeedItem[]> {
  const [first, ...rest] = tags;
  const timelineQs = new URLSearchParams({ limit: "25" });
  for (const t of rest) timelineQs.append("any[]", t);

  const [trendsResult, timelineResult] = await Promise.allSettled([
    fetchJson<MastoStatus[]>(`https://${instance}/api/v1/trends/statuses?limit=20`),
    fetchJson<MastoStatus[]>(
      `https://${instance}/api/v1/timelines/tag/${encodeURIComponent(first)}?${timelineQs}`
    ),
  ]);

  const matches = keywordMatcher(tags);
  const trending =
    trendsResult.status === "fulfilled"
      ? trendsResult.value
          .filter((s) => matches(stripHtml(s.content ?? "")))
          .map((s) => toItem(s, instance, "trending"))
      : [];
  const timeline =
    timelineResult.status === "fulfilled"
      ? timelineResult.value.map((s) => toItem(s, instance, `#${first}`))
      : [];

  if (!trending.length && timelineResult.status === "rejected") {
    throw timelineResult.reason instanceof Error
      ? timelineResult.reason
      : new Error("Mastodon fetch failed");
  }

  // Dedupe (a post can be both trending and in the tag timeline).
  const seen = new Set<string>();
  const merged = [...trending, ...timeline].filter((i) => {
    if (seen.has(i.url)) return false;
    seen.add(i.url);
    return true;
  });

  // Prefer posts with actual engagement, but don't blank sparse tags/instances.
  const engaged = merged.filter((i) => (i.score ?? 0) > 0);
  const pool = engaged.length >= 12 ? engaged : merged;
  return pool.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 25);
}
