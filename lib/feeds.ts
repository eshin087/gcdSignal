import type { SourceId } from "./types";

export interface BuiltInFeed {
  /** Built-in feed id doubles as the source id. */
  id: SourceId;
  source: SourceId;
  label: string;
}

export const BUILT_IN_FEEDS: BuiltInFeed[] = [
  { id: "reddit", source: "reddit", label: "Reddit" },
  { id: "hackernews", source: "hackernews", label: "Hacker News" },
  { id: "rss", source: "rss", label: "AI News" },
  { id: "bluesky", source: "bluesky", label: "Bluesky" },
  { id: "mastodon", source: "mastodon", label: "Mastodon" },
  { id: "fourchan", source: "fourchan", label: "4chan /g/" },
];

/** Client-safe list (no adapter imports) for validating stored prefs. */
export const SOURCE_IDS: SourceId[] = BUILT_IN_FEEDS.map((f) => f.id);

export const SOURCE_COLORS: Record<SourceId, string> = {
  reddit: "#FF4500",
  hackernews: "#FF6600",
  rss: "#F59E0B",
  bluesky: "#0085FF",
  mastodon: "#6364FF",
  fourchan: "#789922",
};
