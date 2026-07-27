import type { SourceId } from "./types";

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
  // Last so it sits far right when visible.
  { id: "fourchan", source: "fourchan", label: "4chan /g/" },
];

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
