import { fetchJson, truncate, USER_AGENT } from "../fetch-helpers";
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

// Bluesky's public AppView WAF-blocks many networks and datacenter ranges.
// Optional escape hatch: an app password (bsky.social account settings) lets
// us search through the sanctioned authenticated path instead.
let session: { token: string; expires: number } | null = null;

async function getSession(): Promise<string | null> {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) return null;
  if (session && session.expires > Date.now()) return session.token;
  try {
    const res = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify({ identifier, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessJwt: string };
    session = { token: data.accessJwt, expires: Date.now() + 90 * 60_000 };
    return session.token;
  } catch {
    return null;
  }
}

export async function fetchBluesky({ q }: { q: string }, fresh = false): Promise<FeedItem[]> {
  const rv = fresh ? 0 : undefined;
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const path =
    `/xrpc/app.bsky.feed.searchPosts` +
    `?q=${encodeURIComponent(q)}&sort=top&limit=25&since=${encodeURIComponent(since)}`;

  const attempts: Array<() => Promise<{ posts: BskyPost[] }>> = [
    () => fetchJson(`https://public.api.bsky.app${path}`, { revalidate: rv }),
    () => fetchJson(`https://api.bsky.app${path}`, { revalidate: rv }),
  ];
  const token = await getSession();
  if (token) {
    attempts.push(() =>
      fetchJson(`https://bsky.social${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        revalidate: rv,
      })
    );
  }

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const data = await attempt();
      return mapPosts(data.posts);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Bluesky fetch failed");
}

function mapPosts(posts: BskyPost[]): FeedItem[] {
  return posts.map((p) => {
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
