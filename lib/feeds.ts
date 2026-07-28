import type { PanelId, SourceId } from "./types";

export interface BuiltInFeed {
  /** Built-in feed id doubles as the source id. */
  id: SourceId;
  source: SourceId;
  label: string;
}

export const BUILT_IN_FEEDS: BuiltInFeed[] = [
  { id: "reddit", source: "reddit", label: "Reddit" },
  { id: "rss", source: "rss", label: "AI News" },
  { id: "youtube", source: "youtube", label: "YouTube" },
  { id: "bluesky", source: "bluesky", label: "Bluesky" },
  { id: "hackernews", source: "hackernews", label: "Hacker News" },
  { id: "papers", source: "papers", label: "Papers" },
  { id: "github", source: "github", label: "GitHub" },
  { id: "fourchan", source: "fourchan", label: "4chan /g/" },
];

/** Computed deck columns that aren't fetchable sources. */
export interface PanelDef {
  id: PanelId;
  label: string;
}

export const PANELS: PanelDef[] = [
  { id: "top10", label: "Daily Top 10" },
  { id: "momentum", label: "Momentum" },
];

export const PANEL_LABELS: Record<PanelId, string> = {
  top10: "Daily Top 10",
  momentum: "Momentum",
};

export function isPanelId(v: string): v is PanelId {
  return v === "top10" || v === "momentum";
}

/** Default deck order: Top 10 far left, Momentum after the core feeds,
 *  default-hidden sources trailing. */
export const DEFAULT_ORDER: string[] = [
  "top10",
  "reddit",
  "rss",
  "youtube",
  "bluesky",
  "hackernews",
  "momentum",
  "papers",
  "github",
  "fourchan",
];

/** Every orderable deck id for a given custom-feed list (panels + built-ins + customs). */
export function deckKnownIds(custom: Array<{ id: string }>): string[] {
  return [...DEFAULT_ORDER, ...custom.map((c) => c.id)];
}

/**
 * Stored order → render order: keep the user's known ids in their order, then
 * append anything new/unknown-to-the-stored-list (new built-ins, newly added
 * custom feeds) at the end. Pure derivation — stored order is never pruned.
 */
export function effectiveOrder(stored: string[], knownIds: string[]): string[] {
  const known = new Set(knownIds);
  const out = stored.filter((id) => known.has(id));
  const placed = new Set(out);
  for (const id of knownIds) {
    if (!placed.has(id)) out.push(id);
  }
  return out;
}

/**
 * Every valid source id — deliberately NOT derived from BUILT_IN_FEEDS, since
 * stored custom feeds are validated against this list.
 */
export const SOURCE_IDS: SourceId[] = [
  "reddit",
  "hackernews",
  "rss",
  "bluesky",
  "fourchan",
  "youtube",
  "github",
  "papers",
];

export const SOURCE_LABELS: Record<SourceId, string> = {
  reddit: "Reddit",
  hackernews: "Hacker News",
  rss: "AI News",
  bluesky: "Bluesky",
  fourchan: "4chan /g/",
  youtube: "YouTube",
  github: "GitHub",
  papers: "Papers",
};

/**
 * Brand colors as CSS variables (defined in globals.css) so near-black brands
 * (GitHub) can flip to light values in dark mode. Use with `style={{color}}`
 * or `color-mix(in srgb, <color> N%, transparent)` — never string-concatenate
 * alpha hex onto these.
 */
export const SOURCE_COLORS: Record<SourceId, string> = {
  reddit: "var(--src-reddit)",
  hackernews: "var(--src-hackernews)",
  rss: "var(--src-rss)",
  bluesky: "var(--src-bluesky)",
  fourchan: "var(--src-fourchan)",
  youtube: "var(--src-youtube)",
  github: "var(--src-github)",
  papers: "var(--src-papers)",
};
