import { decodeEntities, fetchText, keywordMatcher } from "./fetch-helpers";
import type { FeedItem, MomentumStatus, MomentumTopic } from "./types";

/** 12 × 6h buckets = 72h of conversation history (12 bars in the chart). */
const BUCKET_H = 6;
const BUCKETS = 12;
/** Spark indices (oldest→newest): last 24h vs the 24h before it. */
const RECENT_FROM = BUCKETS - 4;
const PREV_FROM = BUCKETS - 8;
/** Minimum mentions across the window for a topic to appear at all. */
const MIN_MENTIONS = 4;
/** Auto-detected terms need a bit more evidence than curated ones. */
const MIN_AUTO_MENTIONS = 5;
const MAX_AUTO = 5;
const MAX_TOPICS = 14;

interface TopicDef {
  label: string;
  terms: string[];
}

/** Names worth tracking permanently — models, labs, and recurring themes. */
const CURATED: TopicDef[] = [
  { label: "OpenAI", terms: ["openai", "sam altman"] },
  { label: "GPT-5", terms: ["gpt-5", "gpt5"] },
  { label: "ChatGPT", terms: ["chatgpt"] },
  { label: "Sora", terms: ["sora"] },
  { label: "Anthropic", terms: ["anthropic"] },
  { label: "Claude", terms: ["claude"] },
  { label: "Gemini", terms: ["gemini"] },
  { label: "DeepMind", terms: ["deepmind"] },
  { label: "Llama / Meta AI", terms: ["llama", "meta ai"] },
  { label: "Mistral", terms: ["mistral"] },
  { label: "DeepSeek", terms: ["deepseek"] },
  { label: "Qwen", terms: ["qwen"] },
  { label: "Grok / xAI", terms: ["grok", "xai"] },
  { label: "Nvidia", terms: ["nvidia"] },
  { label: "Midjourney", terms: ["midjourney"] },
  { label: "Stable Diffusion", terms: ["stable diffusion", "sdxl"] },
  { label: "Hugging Face", terms: ["hugging face", "huggingface"] },
  { label: "Cursor", terms: ["cursor"] },
  { label: "Copilot", terms: ["copilot"] },
  { label: "Agents", terms: ["agent", "agentic"] },
  { label: "MCP", terms: ["mcp", "model context protocol"] },
  { label: "RAG", terms: ["rag", "retrieval-augmented", "retrieval augmented"] },
  { label: "Open weights", terms: ["open weights", "open-weight", "open source model", "open-source model"] },
  { label: "Jailbreaks", terms: ["jailbreak", "prompt injection"] },
  { label: "Robotics", terms: ["robotics", "humanoid", "robot"] },
  { label: "Regulation", terms: ["regulation", "ai act", "lawsuit", "copyright"] },
  { label: "AGI", terms: ["agi", "superintelligence"] },
  { label: "Deepfakes", terms: ["deepfake", "voice clon"] },
  { label: "Vibe coding", terms: ["vibe coding", "vibe-cod", "claude code", "codex"] },
  { label: "Benchmarks", terms: ["benchmark", "leaderboard", "eval"] },
];

/** Capitalized words that spike constantly without being a topic. */
const AUTO_EXCLUDE = new Set([
  "the", "this", "that", "these", "those", "how", "why", "what", "when",
  "where", "who", "which", "here", "there", "new", "first", "inside", "meet",
  "from", "with", "will", "can", "just", "watch", "video", "show", "ask",
  "tell", "best", "top", "guide", "review", "update", "news", "week", "today",
  "year", "day", "time", "people", "world", "tech", "technology", "everything",
  "everyone", "nobody", "before", "after", "into", "your", "our", "their",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  "reddit", "youtube", "github", "bluesky", "twitter", "verge", "techcrunch",
  "wired", "ars", "technica", "mit", "ieee", "zdnet", "techradar", "decoder",
  "google", "microsoft", "meta", "apple", "amazon", "intel", "amd", "china",
  "chinese", "american", "silicon", "valley", "llm", "llms", "model", "models",
  "chatbot", "chatbots", "startup", "startups", "billion", "million", "report",
  "study", "paper", "research", "researchers", "scientists", "engineers",
  "ai", "data", "datacenter", "datacenters", "center", "centers", "cloud",
  "book", "books", "stock", "stocks", "market", "markets", "money", "bubble",
  "price", "prices", "deal", "deals", "job", "jobs", "human", "humans",
  "future", "history", "science", "internet", "computer", "computers",
  "software", "hardware", "company", "companies", "workers", "employees",
]);

interface PoolItem {
  text: string;
  title: string;
  url: string;
  bucket: number; // 0 = newest 12h
  /** Engagement blended with recency — picks each topic's "why" headline. */
  weight: number;
}

const bucketOf = (now: number, ts: number): number =>
  Math.min(BUCKETS - 1, Math.max(0, Math.floor((now - ts) / (BUCKET_H * 3600_000))));

/**
 * Momentum = share-of-conversation per 12h bucket over 72h (topic mentions ÷
 * total items in that bucket — normalizes the sources' uneven time windows),
 * classified by how the recent 24h compares to the 48h before it.
 */
export async function buildMomentum(items: FeedItem[], fresh = false): Promise<MomentumTopic[]> {
  const now = Date.now();
  const horizon = BUCKETS * BUCKET_H * 3600_000;

  const pool: PoolItem[] = [];
  const totals = new Array<number>(BUCKETS).fill(0);
  for (const it of items) {
    const ts = Date.parse(it.timestamp);
    if (!Number.isFinite(ts) || now - ts >= horizon || ts > now + 3600_000) continue;
    const bucket = bucketOf(now, ts);
    totals[bucket]++;
    const ageH = Math.max(0, (now - ts) / 3600_000);
    pool.push({
      text: `${it.title} ${it.excerpt ?? ""}`,
      title: it.title,
      url: it.externalUrl ?? it.url,
      bucket,
      // +1 keeps scoreless rss headlines rankable by pure recency.
      weight: ((it.score ?? 0) + 2 * (it.comments ?? 0) + 1) * Math.exp(-ageH / 24),
    });
  }
  if (!pool.length) return [];

  const curatedMatchers = CURATED.map((t) => keywordMatcher(t.terms));
  const defs: Array<TopicDef & { auto?: boolean }> = [
    ...CURATED,
    ...autoTopics(pool, (text) => curatedMatchers.some((m) => m(text))),
  ];

  const xTrends = await fetchXTrends(fresh);

  const topics: Array<
    MomentumTopic & { recent: number; prevDay: number; candidates: PoolItem[] }
  > = [];
  for (const def of defs) {
    const matches = keywordMatcher(def.terms);
    const counts = new Array<number>(BUCKETS).fill(0);
    let mentions = 0;
    // Top two matching stories — the runner-up steps in when one viral
    // roundup video would otherwise headline half the topics.
    let best: PoolItem | null = null;
    let second: PoolItem | null = null;
    for (const p of pool) {
      if (matches(p.text)) {
        counts[p.bucket]++;
        mentions++;
        if (!best || p.weight > best.weight) {
          second = best;
          best = p;
        } else if (!second || p.weight > second.weight) {
          second = p;
        }
      }
    }
    if (mentions < (def.auto ? MIN_AUTO_MENTIONS : MIN_MENTIONS)) continue;

    // Oldest → newest for display; shares normalize per-bucket volume.
    const spark: number[] = [];
    for (let b = BUCKETS - 1; b >= 0; b--) {
      spark.push(totals[b] > 0 ? counts[b] / totals[b] : 0);
    }
    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / Math.max(1, arr.length);
    const recent = avg(spark.slice(RECENT_FROM));
    const prevDay = avg(spark.slice(PREV_FROM, RECENT_FROM));
    const earlier = avg(spark.slice(0, RECENT_FROM));

    let status: MomentumStatus;
    if (recent >= 2 * earlier && recent > 0.02) status = "emerging";
    else if (recent <= 0.6 * earlier) status = "fading";
    else status = "steady";

    // Day-over-day share change — the ticker number. No base → "new".
    const changePct =
      prevDay > 0.001
        ? Math.max(-999, Math.min(999, Math.round(((recent - prevDay) / prevDay) * 100)))
        : null;

    topics.push({
      topic: def.label,
      status,
      mentions,
      spark: spark.map((s) => Number(s.toFixed(4))),
      xTrending: matchesTrend(def, xTrends) || undefined,
      auto: def.auto || undefined,
      changePct,
      candidates: [best, second].filter(
        (p): p is PoolItem => p !== null && p.url.startsWith("http")
      ),
      recent,
      prevDay,
    });
  }

  // "Peaking" is relative: steady topics whose current share sits in the top
  // quartile of everything tracked right now.
  const recents = topics.map((t) => t.recent).sort((a, b) => a - b);
  const q75 = recents[Math.floor(recents.length * 0.75)] ?? Infinity;
  for (const t of topics) {
    if (t.status === "steady" && t.recent >= q75 && t.recent > 0.03) t.status = "peaking";
  }

  const rank: Record<MomentumStatus, number> = { emerging: 0, peaking: 1, steady: 2, fading: 3 };
  const shown = topics
    .sort((a, b) => rank[a.status] - rank[b.status] || b.recent - a.recent || b.mentions - a.mentions)
    .slice(0, MAX_TOPICS);

  // Rank movement within the shown set: today's activity order vs yesterday's.
  const idxBy = (key: "recent" | "prevDay") => {
    const order = [...shown].sort((a, b) => b[key] - a[key]);
    return new Map(order.map((t, i) => [t.topic, i]));
  };
  const curIdx = idxBy("recent");
  const prevIdx = idxBy("prevDay");

  // Headline dedupe: one viral video can be the loudest match for half the
  // topics — give later topics their runner-up story instead of a repeat.
  const usedUrls = new Set<string>();
  return shown.map((t) => {
    const pick = t.candidates.find((c) => !usedUrls.has(c.url)) ?? t.candidates[0];
    if (pick) usedUrls.add(pick.url);
    const delta = (prevIdx.get(t.topic) ?? 0) - (curIdx.get(t.topic) ?? 0);
    return {
      topic: t.topic,
      status: t.status,
      mentions: t.mentions,
      spark: t.spark,
      xTrending: t.xTrending,
      auto: t.auto,
      changePct: t.changePct,
      rankDelta: delta !== 0 && t.prevDay > 0 ? delta : undefined,
      top: pick ? { title: pick.title, url: pick.url } : undefined,
    };
  });
}

/**
 * Auto extras: capitalized or versioned tokens (and capitalized bigrams) from
 * titles that spiked in the last 24h and aren't covered by the curated list —
 * catches a brand-new model name the day it drops.
 */
function autoTopics(
  pool: PoolItem[],
  curatedMatch: (text: string) => boolean
): Array<TopicDef & { auto: true }> {
  interface Cand {
    count: number;
    recent: number;
    earlier: number;
    casings: Map<string, number>;
  }
  const cands = new Map<string, Cand>();

  const consider = (display: string, bucket: number) => {
    const clean = display.replace(/['’]s$/, "").replace(/[^\w\s.-]+$/g, "").trim();
    if (clean.length < 2) return;
    const lower = clean.toLowerCase();
    if (AUTO_EXCLUDE.has(lower)) return;
    if (lower.split(/\s+/).some((w) => AUTO_EXCLUDE.has(w) && !/\d/.test(w))) return;
    if (curatedMatch(clean)) return;
    const cand = cands.get(lower) ?? { count: 0, recent: 0, earlier: 0, casings: new Map() };
    cand.count++;
    if (bucket <= 3) cand.recent++; // newest 24h at 6h buckets
    else cand.earlier++;
    cand.casings.set(clean, (cand.casings.get(clean) ?? 0) + 1);
    cands.set(lower, cand);
  };

  const capRe = /^[A-Z][A-Za-z0-9.-]{2,}$/;
  const versionRe = /^[A-Za-z]{1,12}[-.]?\d{1,4}(\.\d+)?$/;
  for (const p of pool) {
    const words = p.title.split(/\s+/).map((w) => w.replace(/^[("'“‘[]+|[)"'”’\],.:;!?]+$/g, ""));
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (!w) continue;
      const isCap = capRe.test(w);
      const isVersion = versionRe.test(w) && /\d/.test(w) && /[A-Za-z]/.test(w);
      // A lone capitalized English word ("Data", "Books") is almost never a
      // topic — single-word candidates need a digit or internal capital
      // ("GPT5", "DeepSeek"); plain names surface via bigrams instead.
      const distinctive = /\d/.test(w) || /[A-Z]/.test(w.slice(1));
      if (isCap && i > 0 && distinctive) consider(w, p.bucket);
      if (isVersion) consider(w, p.bucket);
      // Capitalized bigram ("Genie 4", "Kimi K3").
      if (isCap && i + 1 < words.length) {
        const next = words[i + 1];
        if (next && (capRe.test(next) || /^\d[\w.]*$/.test(next) || versionRe.test(next))) {
          consider(`${w} ${next}`, p.bucket);
        }
      }
    }
  }

  const picked: Array<TopicDef & { auto: true }> = [];
  const sorted = [...cands.entries()]
    .filter(([, c]) => c.count >= MIN_AUTO_MENTIONS && c.recent >= Math.max(2, c.earlier))
    .sort((a, b) => b[1].count - a[1].count);
  for (const [lower, c] of sorted) {
    if (picked.length >= MAX_AUTO) break;
    // Prefer the bigram over its parts (and vice versa) — keep whichever won.
    if (picked.some((p) => {
      const pl = p.terms[0];
      return pl.includes(lower) || lower.includes(pl);
    })) {
      continue;
    }
    const label = [...c.casings.entries()].sort((a, b) => b[1] - a[1])[0][0];
    picked.push({ label, terms: [lower], auto: true });
  }
  return picked;
}

/* ---------------- X trending badge (trends24 scrape) ---------------- */

const TRENDS_URL = "https://trends24.in/united-states/";
// trends24 serves plain server-rendered HTML but sits behind Cloudflare —
// treat it as revocable: any failure just means no badges this round.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

async function fetchXTrends(fresh: boolean): Promise<Set<string>> {
  try {
    const html = await fetchText(TRENDS_URL, {
      revalidate: fresh ? 0 : 1800,
      timeoutMs: 6000,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml" },
    });
    const out = new Set<string>();
    const re = /<a[^>]*class=["']?trend-link["']?[^>]*>([^<]+)<\/a>/g;
    let m: RegExpExecArray | null;
    // The page holds ~33 hourly snapshot blocks; the first ~100 anchors cover
    // the freshest few hours.
    while ((m = re.exec(html)) && out.size < 100) {
      const norm = normalizeTrend(decodeEntities(m[1]));
      if (norm) out.add(norm);
    }
    return out;
  } catch {
    return new Set();
  }
}

const normalizeTrend = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

function matchesTrend(def: TopicDef, trends: Set<string>): boolean {
  if (!trends.size) return false;
  const norms = [def.label, ...def.terms].map(normalizeTrend).filter(Boolean);
  for (const n of norms) {
    if (trends.has(n)) return true;
    if (n.length >= 5) {
      for (const t of trends) {
        if (t.includes(n)) return true;
      }
    }
  }
  return false;
}
