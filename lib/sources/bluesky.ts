import { fetchJson, truncate, USER_AGENT } from "../fetch-helpers";
import type { FeedItem } from "../types";

interface BskyPost {
  uri: string;
  author: { handle: string; displayName?: string };
  record?: { text?: string; createdAt?: string };
  embed?: {
    $type?: string;
    images?: Array<{ thumb?: string }>;
    external?: { thumb?: string };
  };
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  indexedAt: string;
}

/** Embed view shapes vary (images / external / recordWithMedia…) — degrade to
 *  no thumbnail on anything unexpected, never throw. */
function bskyThumb(p: BskyPost): string | undefined {
  const candidate = p.embed?.images?.[0]?.thumb ?? p.embed?.external?.thumb;
  return typeof candidate === "string" && candidate.startsWith("https://")
    ? candidate
    : undefined;
}

// Bluesky's anonymous AppView hosts are WAF-blocked from datacenter ranges
// and, as of 2026-09, from residential networks too. The sanctioned path is
// an app password (bsky.social account settings) — it goes first whenever
// credentials exist, and blocked anonymous hosts are remembered for 30 min
// so a fetch doesn't burn two doomed round-trips before the one that works.
const AUTH_HOST = "https://bsky.social";
const ANON_HOSTS = ["https://public.api.bsky.app", "https://api.bsky.app"];
const BLOCK_MS = 30 * 60_000;
const blockedUntil = new Map<string, number>();

let session: { token: string; expires: number } | null = null;

async function getSession(): Promise<string | null> {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) return null;
  if (session && session.expires > Date.now()) return session.token;
  try {
    const res = await fetch(`${AUTH_HOST}/xrpc/com.atproto.server.createSession`, {
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
  const since = new Date(Math.floor(Date.now() / 300_000) * 300_000 - 7 * 86400_000).toISOString();
  // lang=en: "ai" is an everyday word in several languages (愛) — the audit's
  // leak risk once the source is reachable again.
  const path =
    `/xrpc/app.bsky.feed.searchPosts` +
    `?q=${encodeURIComponent(q)}&sort=top&limit=50&lang=en&since=${encodeURIComponent(since)}`;

  const attempts: Array<{ host: string; run: () => Promise<{ posts: BskyPost[] }> }> = [];
  const token = await getSession();
  if (token) {
    attempts.push({
      host: AUTH_HOST,
      run: () =>
        fetchJson(`${AUTH_HOST}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
          revalidate: rv,
        }),
    });
  }
  for (const host of ANON_HOSTS) {
    if ((blockedUntil.get(host) ?? 0) > Date.now()) continue;
    attempts.push({ host, run: () => fetchJson(`${host}${path}`, { revalidate: rv }) });
  }
  if (!attempts.length) {
    throw new Error("Bluesky anonymous API is blocked and no app password is configured");
  }

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const data = await attempt.run();
      return mapPosts(data.posts);
    } catch (e) {
      lastError = e;
      if (attempt.host !== AUTH_HOST && e instanceof Error && /\b403\b/.test(e.message)) {
        blockedUntil.set(attempt.host, Date.now() + BLOCK_MS);
      }
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
      thumbnail: bskyThumb(p),
      score: (p.likeCount ?? 0) + (p.repostCount ?? 0),
      comments: p.replyCount ?? 0,
      author: `@${p.author.handle}`,
      timestamp: p.record?.createdAt ?? p.indexedAt,
      excerpt: text.length > 140 ? truncate(text, 280) : undefined,
      sourceMeta: p.author.displayName || `@${p.author.handle}`,
    };
  });
}
