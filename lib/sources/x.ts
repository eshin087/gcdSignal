import { fetchJson, fetchText, makeMatcher, truncate } from "../fetch-helpers";
import type { FeedItem } from "../types";

/**
 * X has no free API. Two-stage unofficial approach (verified):
 * 1. Discovery — the embed-widget timeline endpoint lists an account's recent
 *    tweet ids. Works, but is heavily IP-rate-limited, so: long cache, tolerate
 *    per-account failure, keep a module-scope last-good cache.
 * 2. Hydration — cdn.syndication.twimg.com/tweet-result (the react-tweet
 *    endpoint) is reliable and returns like + reply counts per tweet.
 */
const X_ACCOUNTS = [
  "OpenAI",
  "AnthropicAI",
  "karpathy",
  "sama",
  "ylecun",
  "emollick",
  "GoogleDeepMind",
  "AndrewYNg",
];

const MAX_IDS_PER_ACCOUNT = 3;
const MAX_AGE_MS = 7 * 86400_000;

interface TweetResult {
  __typename?: string;
  id_str?: string;
  text?: string;
  created_at?: string;
  favorite_count?: number;
  conversation_count?: number;
  user?: { screen_name?: string; name?: string };
}

interface TimelineEntry {
  type?: string;
  content?: { tweet?: { id_str?: string } };
}

// Same token derivation react-tweet uses for the public syndication CDN.
function tweetToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

let lastGood: { items: FeedItem[]; at: number } | null = null;

async function discoverIds(handle: string, revalidate?: number): Promise<string[]> {
  const html = await fetchText(
    `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}?showReplies=false`,
    { revalidate: revalidate ?? 600, timeoutMs: 8000, headers: { Accept: "text/html" } }
  );
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("timeline payload missing");
  const data = JSON.parse(m[1]) as {
    props?: { pageProps?: { timeline?: { entries?: TimelineEntry[] } } };
  };
  const entries = data.props?.pageProps?.timeline?.entries ?? [];
  return entries
    .filter((e) => e.type === "tweet" && e.content?.tweet?.id_str)
    .slice(0, MAX_IDS_PER_ACCOUNT)
    .map((e) => e.content!.tweet!.id_str!);
}

async function hydrate(id: string, handle: string, revalidate?: number): Promise<FeedItem | null> {
  const t = await fetchJson<TweetResult>(
    `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${tweetToken(id)}&lang=en`,
    { revalidate: revalidate ?? 600, timeoutMs: 8000 }
  );
  if (!t.id_str || !t.text) return null;
  const screenName = t.user?.screen_name ?? handle;
  const text = t.text.replace(/\s+/g, " ").trim();
  return {
    id: `x:${t.id_str}`,
    source: "x",
    title: truncate(text, 140) || "(media post)",
    url: `https://x.com/${screenName}/status/${t.id_str}`,
    score: t.favorite_count ?? 0,
    comments: t.conversation_count ?? 0,
    author: `@${screenName}`,
    timestamp: t.created_at ?? new Date().toISOString(),
    excerpt: text.length > 140 ? truncate(text, 280) : undefined,
    sourceMeta: t.user?.name || `@${screenName}`,
  };
}

export async function fetchX(
  { handle, keywords = [] }: { handle?: string; keywords?: string[] },
  fresh = false
): Promise<FeedItem[]> {
  const rv = fresh ? 0 : undefined;
  const accounts = handle ? [handle] : X_ACCOUNTS;

  const discovered = await Promise.allSettled(
    accounts.map(async (acct) => ({ acct, ids: await discoverIds(acct, rv) }))
  );
  const idPairs = discovered
    .filter((r): r is PromiseFulfilledResult<{ acct: string; ids: string[] }> => r.status === "fulfilled")
    .flatMap((r) => r.value.ids.map((id) => ({ id, acct: r.value.acct })));

  if (!idPairs.length) {
    // Full discovery failure (cold rate-limit) — serve the last good batch if recent.
    if (lastGood && Date.now() - lastGood.at < 2 * 3600_000) return lastGood.items;
    const firstErr = discovered.find((r) => r.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    throw firstErr?.reason instanceof Error
      ? firstErr.reason
      : new Error("X timeline discovery failed (rate limited)");
  }

  const hydrated = await Promise.allSettled(idPairs.map((p) => hydrate(p.id, p.acct, rv)));
  const matches = makeMatcher(keywords);
  const cutoff = Date.now() - MAX_AGE_MS;
  const items = hydrated
    .filter((r): r is PromiseFulfilledResult<FeedItem | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((it): it is FeedItem => it !== null)
    .filter((it) => Date.parse(it.timestamp) > cutoff)
    .filter((it) => matches(it.title, it.excerpt ?? ""))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 25);

  if (!items.length && lastGood && Date.now() - lastGood.at < 2 * 3600_000) {
    return lastGood.items;
  }
  if (items.length && !handle) lastGood = { items, at: Date.now() };
  return items;
}
