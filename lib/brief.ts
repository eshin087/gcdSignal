import type { BriefStory, FeedItem, SourceId } from "./types";

/** Stories older than this can't make the daily list. */
const MAX_AGE_H = 36;
const RECENCY_HALFLIFE_H = 36;
/** Weight of "another distinct source covers this" vs engagement percentiles. */
const CROSS_SOURCE_WEIGHT = 3;

/** Generic words that don't identify a story — clustering runs on what's left. */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is",
  "are", "was", "be", "been", "being", "its", "it", "at", "by", "as", "after",
  "from", "how", "why", "what", "when", "where", "who", "which", "than", "then",
  "that", "this", "these", "those", "not", "but", "has", "have", "had", "will",
  "can", "could", "would", "should", "may", "might", "you", "your", "we", "our",
  "they", "their", "his", "her", "he", "she", "i", "my", "me", "us", "them",
  "says", "say", "said", "announces", "announced", "launches", "launched",
  "releases", "released", "release", "launch", "introduces", "unveils", "now",
  "just", "over", "about", "into", "more", "most", "up", "out", "vs", "amid",
  "report", "reportedly", "using", "use", "used", "against", "during",
  "between", "while", "some", "all", "one", "two", "new", "first", "get",
  "gets", "got", "make", "makes", "made", "do", "does", "did", "here", "there",
  "still", "no", "yes", "so", "if", "because", "before", "off", "back",
  // Every headline here mentions AI — it identifies nothing.
  "ai", "ais", "artificial", "intelligence",
]);

interface Member {
  item: FeedItem;
  pct: number;
  tokens: Set<string>;
  ext: string | null;
}

/** host+path of the outbound article — the strongest same-story signal. */
function normalizeExternal(item: FeedItem): string | null {
  const url = item.externalUrl ?? (item.source === "rss" ? item.url : undefined);
  if (!url) return null;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    if (!path || path === "/") return null; // bare domains cluster everything
    return `${u.hostname.replace(/^www\./, "")}${path}`.toLowerCase();
  } catch {
    return null;
  }
}

function titleTokens(title: string): Set<string> {
  const out = new Set<string>();
  for (const raw of title.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9.-]+/)) {
    const t = raw.replace(/^[.-]+|[.-]+$/g, "");
    if (!t) continue;
    if (t.length < 3 && !/\d/.test(t)) continue;
    if (STOPWORDS.has(t)) continue;
    out.add(t);
  }
  return out;
}

/** Same story iff shared article URL, or strong distinctive-token containment. */
function sameStory(a: Member, b: Member): boolean {
  if (a.ext && b.ext && a.ext === b.ext) return true;
  if (!a.tokens.size || !b.tokens.size) return false;
  let inter = 0;
  for (const t of a.tokens) if (b.tokens.has(t)) inter++;
  return inter >= 2 && inter / Math.min(a.tokens.size, b.tokens.size) >= 0.5;
}

/**
 * Engagement percentile within each source — reddit votes, youtube views and
 * bsky likes are incomparable in magnitude, but "top 10% of its feed" is.
 */
function engagementPercentiles(items: FeedItem[]): Map<FeedItem, number> {
  const bySource = new Map<SourceId, FeedItem[]>();
  for (const it of items) {
    const group = bySource.get(it.source) ?? [];
    group.push(it);
    bySource.set(it.source, group);
  }
  const out = new Map<FeedItem, number>();
  for (const group of bySource.values()) {
    const engagement = (it: FeedItem) => (it.score ?? 0) + 2 * (it.comments ?? 0);
    const sorted = [...group].sort((a, b) => engagement(a) - engagement(b));
    sorted.forEach((it, i) => {
      out.set(it, sorted.length > 1 ? i / (sorted.length - 1) : 0.5);
    });
  }
  return out;
}

/**
 * Cluster items across sources into stories and rank by cross-source buzz:
 * how many distinct sources cover it + how loud each member is within its own
 * source, decayed by age.
 */
export function buildTop10(items: FeedItem[], now = Date.now()): BriefStory[] {
  const cutoff = now - MAX_AGE_H * 3600_000;
  const pool = items.filter((it) => {
    const t = Date.parse(it.timestamp);
    return Number.isFinite(t) && t > cutoff && t < now + 3600_000;
  });

  const pcts = engagementPercentiles(pool);
  const members: Member[] = pool.map((item) => ({
    item,
    pct: pcts.get(item) ?? 0,
    tokens: titleTokens(item.title),
    ext: normalizeExternal(item),
  }));
  // Loudest first, so cluster representatives skew high-engagement.
  members.sort((a, b) => b.pct - a.pct);

  const clusters: Member[][] = [];
  for (const m of members) {
    const home = clusters.find((c) => c.some((x) => sameStory(m, x)));
    if (home) home.push(m);
    else clusters.push([m]);
  }

  // A story only ONE source carries must come from a news-carrying source,
  // have a substantive title, AND clear an absolute engagement bar — a top-10
  // slot anchored to a 50-comment reddit thread doesn't read as "top 10".
  // rss is exempt (editorial outlets carry no metrics). Multi-source clusters
  // are exempt from all of it — corroboration is the signal.
  const SINGLE_SOURCE_FLOOR: Partial<Record<SourceId, number>> = {
    reddit: 300,
    hackernews: 300,
    youtube: 25_000,
    rss: 0,
  };
  const eligible = clusters.filter((c) => {
    if (new Set(c.map((m) => m.item.source)).size > 1) return true;
    const only = c[0];
    const floor = SINGLE_SOURCE_FLOOR[only.item.source];
    if (floor === undefined || only.tokens.size < 2) return false;
    const engagement = (only.item.score ?? 0) + 2 * (only.item.comments ?? 0);
    return engagement >= floor;
  });

  const scored = eligible
    .map((c) => {
      const distinct = new Set(c.map((m) => m.item.source)).size;
      const newest = Math.max(...c.map((m) => Date.parse(m.item.timestamp)));
      const ageH = Math.max(0, (now - newest) / 3600_000);
      const pctSum = c.reduce((s, m) => s + m.pct, 0);
      const score =
        (CROSS_SOURCE_WEIGHT * (distinct - 1) + pctSum) * Math.exp(-ageH / RECENCY_HALFLIFE_H);
      return { c, newest, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const repPreference: SourceId[] = ["rss", "hackernews", "reddit"];
  return scored.map(({ c, newest }) => {
    const rep =
      repPreference.map((s) => c.find((m) => m.item.source === s)).find(Boolean) ?? c[0];
    // Distinct sources ordered by their loudest member.
    const sources: SourceId[] = [];
    for (const m of c) {
      if (!sources.includes(m.item.source)) sources.push(m.item.source);
    }
    const comments = c.reduce((s, m) => s + (m.item.comments ?? 0), 0);
    const url = rep.item.externalUrl ?? rep.item.url;
    return {
      id: rep.item.id,
      title: rep.item.title,
      url,
      discussUrl: rep.item.url !== url ? rep.item.url : undefined,
      sources: sources.slice(0, 6),
      comments: comments > 0 ? comments : undefined,
      timestamp: new Date(newest).toISOString(),
      thumbnail: c.find((m) => m.item.thumbnail?.startsWith("https://"))?.item.thumbnail,
    };
  });
}
