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
  { id: "bluesky", source: "bluesky", label: "Bluesky" },
  { id: "mastodon", source: "mastodon", label: "Mastodon" },
  { id: "fourchan", source: "fourchan", label: "4chan /g/" },
];

/**
 * Every valid source id — deliberately NOT derived from BUILT_IN_FEEDS, since
 * sources like Hacker News exist only as custom feeds and stored prefs are
 * validated against this list.
 */
export const SOURCE_IDS: SourceId[] = [
  "reddit",
  "hackernews",
  "rss",
  "bluesky",
  "mastodon",
  "fourchan",
];

export const SOURCE_LABELS: Record<SourceId, string> = {
  reddit: "Reddit",
  hackernews: "Hacker News",
  rss: "AI News",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  fourchan: "4chan /g/",
};

export const SOURCE_COLORS: Record<SourceId, string> = {
  reddit: "#FF4500",
  hackernews: "#FF6600",
  rss: "#F59E0B",
  bluesky: "#0085FF",
  mastodon: "#6364FF",
  fourchan: "#789922",
};
