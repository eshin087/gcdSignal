export const USER_AGENT = "gcdSignal/1.0 (AI news aggregator)";

interface FetchOpts {
  headers?: Record<string, string>;
  timeoutMs?: number;
  revalidate?: number;
}

export async function fetchJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...opts.headers },
    next: { revalidate: opts.revalidate ?? 300 },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
  });
  if (!res.ok) {
    throw new Error(`${new URL(url).hostname} returned ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, ...opts.headers },
    next: { revalidate: opts.revalidate ?? 300 },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
  });
  if (!res.ok) {
    throw new Error(`${new URL(url).hostname} returned ${res.status}`);
  }
  return res.text();
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => safeCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function safeCodePoint(n: number): string {
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|div|li|blockquote)>/gi, " ")
      .replace(/<[^>]*>/g, "")
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function compileKeywords(keywords: string[]): RegExp[] {
  // Word-boundary matching: short keywords ("ai", "llm") must match whole words
  // so "ai" doesn't hit "Daily"; longer ones stay open-ended as prefixes so
  // "vulnerabilit" matches "vulnerability/vulnerabilities".
  return keywords
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
    .map((k) => {
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}${k.length <= 4 ? "\\b" : ""}`, "i");
    });
}

/** Simple any-keyword match against a single text blob. */
export function keywordMatcher(keywords: string[]): (text: string) => boolean {
  const patterns = compileKeywords(keywords);
  if (!patterns.length) return () => true;
  return (text) => patterns.some((re) => re.test(text));
}

/**
 * Title-weighted topical matching: passes on any headline hit, but body-only
 * mentions need two distinct keywords — kills the "matched `security` in a
 * passing excerpt sentence" class of false positive.
 */
export function makeMatcher(keywords: string[]): (title: string, body?: string) => boolean {
  const patterns = compileKeywords(keywords);
  if (!patterns.length) return () => true;
  return (title, body = "") => {
    if (patterns.some((re) => re.test(title))) return true;
    let hits = 0;
    for (const re of patterns) {
      if (re.test(body) && ++hits >= 2) return true;
    }
    return false;
  };
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
