export const USER_AGENT = "gcdSignal/1.0 (AI news aggregator)";

interface FetchOpts {
  headers?: Record<string, string>;
  timeoutMs?: number;
  revalidate?: number;
}

/** Bound decoded bodies too; Content-Length does not cover chunking/compression. */
export async function readLimitedText(res: Response, maxBytes = 2 * 1024 * 1024): Promise<string> {
  if (Number(res.headers.get("content-length")) > maxBytes) {
    await res.body?.cancel();
    throw new Error("Upstream response is too large");
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new Error("Upstream response is too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const output = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(output);
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
  return JSON.parse(await readLimitedText(res)) as T;
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
  return readLimitedText(res);
}

/** Named entities that appear in headlines and summaries: Latin-1 in code-point
 *  order from U+00A1, then punctuation. An unlisted name is left as written. */
const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ...("iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest "
    + "Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig "
    + "agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml")
    .split(" ").map((name, index): [string, string] => [name, String.fromCodePoint(0xa1 + index)]),
  ...Object.entries({
    ndash: 0x2013, mdash: 0x2014, lsquo: 0x2018, rsquo: 0x2019, sbquo: 0x201a, ldquo: 0x201c, rdquo: 0x201d, bdquo: 0x201e,
    bull: 0x2022, hellip: 0x2026, prime: 0x2032, lsaquo: 0x2039, rsaquo: 0x203a, euro: 0x20ac, trade: 0x2122, larr: 0x2190, rarr: 0x2192, minus: 0x2212,
  }).map(([name, code]): [string, string] => [name, String.fromCodePoint(code)]),
]);

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => safeCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&([A-Za-z][A-Za-z0-9]{2,6});/g, (entity, name: string) => NAMED_ENTITIES.get(name) ?? entity)
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

/**
 * A feed body without the parts that are not the article's own summary. Image
 * captions and credits are not its words, and a list item that is mostly link
 * text is a newsletter prompt or a related headline. Returns the input
 * unchanged when it has neither, so callers can tell nothing was removed.
 */
export function excerptMarkup(html: string): string {
  const linkShare = (inner: string) => {
    const linked = [...inner.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].reduce((sum, match) => sum + stripHtml(match[1]).length, 0);
    return linked / Math.max(1, stripHtml(inner).length);
  };
  return html
    .replace(/<figure\b[\s\S]*?<\/figure>/gi, " ")
    .replace(/<figcaption\b[\s\S]*?<\/figcaption>/gi, " ")
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (item, inner: string) => (linkShare(inner) >= 0.5 ? " " : item));
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
