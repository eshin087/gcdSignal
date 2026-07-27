export type SourceId =
  | "reddit"
  | "fourchan"
  | "bluesky"
  | "hackernews"
  | "rss"
  | "youtube"
  | "github"
  | "papers"
  | "x";

export type CategoryId =
  | "trending"
  | "development"
  | "security"
  | "vibecoding"
  | "research"
  | "industry";

export interface FeedItem {
  id: string;
  source: SourceId;
  /** Plain text — entities decoded, tags stripped. */
  title: string;
  /** Discussion permalink (reddit comments, HN item, bsky post, 4chan thread, article). */
  url: string;
  /** Outbound article link when distinct from the discussion (reddit link posts, HN story URL). */
  externalUrl?: string;
  score?: number;
  comments?: number;
  author?: string;
  /** ISO 8601 */
  timestamp: string;
  /** Plain text, truncated. */
  excerpt?: string;
  /** e.g. "r/LocalLLaMA", "/g/", "The Verge", "#ai" */
  sourceMeta?: string;
}

export interface FeedResponse {
  source: SourceId;
  items: FeedItem[];
  fetchedAt: string;
}

export interface CustomFeed {
  id: string; // `custom:<ts36>`
  source: SourceId;
  label: string;
  /** Spread into the query string — always explicit, so custom feeds are category-independent. */
  params: Record<string, string>;
}

export interface Prefs {
  v: 2;
  category: CategoryId;
  /** Hidden feed ids (built-in SourceIds or custom ids). */
  hidden: string[];
  custom: CustomFeed[];
  /** Auto-refresh cadence in ms; 0 disables. Must be one of REFRESH_OPTIONS. */
  refreshMs: number;
}
