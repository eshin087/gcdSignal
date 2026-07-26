import { fetchJson, truncate } from "../fetch-helpers";
import type { FeedItem } from "../types";

interface BskyPost {
  uri: string;
  author: { handle: string; displayName?: string };
  record?: { text?: string; createdAt?: string };
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  indexedAt: string;
}

export async function fetchBluesky({ q }: { q: string }): Promise<FeedItem[]> {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const u =
    `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts` +
    `?q=${encodeURIComponent(q)}&sort=top&limit=25&since=${encodeURIComponent(since)}`;
  const data = await fetchJson<{ posts: BskyPost[] }>(u);
  return data.posts.map((p) => {
    const rkey = p.uri.split("/").pop() ?? "";
    const text = (p.record?.text ?? "").replace(/\s+/g, " ").trim();
    return {
      id: `bsky:${p.author.handle}:${rkey}`,
      source: "bluesky" as const,
      title: truncate(text, 140) || "(media post)",
      url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
      score: (p.likeCount ?? 0) + (p.repostCount ?? 0),
      comments: p.replyCount ?? 0,
      author: `@${p.author.handle}`,
      timestamp: p.record?.createdAt ?? p.indexedAt,
      excerpt: text.length > 140 ? truncate(text, 280) : undefined,
      sourceMeta: p.author.displayName || `@${p.author.handle}`,
    };
  });
}
