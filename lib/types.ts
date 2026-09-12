export type SourceId =
  | "reddit"
  | "fourchan"
  | "bluesky"
  | "hackernews"
  | "rss"
  | "youtube"
  | "github"
  | "papers";

export type CategoryId =
  | "trending"
  | "development"
  | "security"
  | "vibecoding"
  | "research"
  | "industry";

export type TextScale = "sm" | "md" | "lg" | "xl";
export type SortMode = "hot" | "new" | "top" | "discussed" | "signal";
export type ContentMode = "builder" | "broad";
export type ContentKind = "News" | "Release" | "Tool" | "Tutorial" | "Research" | "Security" | "Discussion" | "Commentary";
export interface Curation {
  kind: ContentKind;
  topics: CategoryId[];
  reasons: string[];
  builder: boolean;
  primary?: boolean;
  substantive?: boolean;
  sponsored?: boolean;
}
export type ViewMode = "brief" | "deck" | "library";
export type Density = "comfortable" | "compact";

export interface FeedItem {
  id: string;
  source: SourceId;
  /** Plain text — entities decoded, tags stripped. */
  title: string;
  /** Absolute https URL only. */
  thumbnail?: string;
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
  /** Estimated article reading time — only set when full content was available. */
  readMinutes?: number;
  /** Video length in seconds (YouTube API path only). */
  durationSec?: number;
  curation?: Curation;
}

export interface SourceHealth {
  id: string;
  status: "ok" | "error" | "stale";
  message?: string;
  checkedAt?: string;
  lastSuccessAt?: string;
}

export interface FeedHealth {
  total: number;
  succeeded: number;
  failed: number;
  degraded: boolean;
  details?: SourceHealth[];
}

export interface FeedResponse {
  schemaVersion?: 2;
  health?: FeedHealth;
  source: SourceId;
  items: FeedItem[];
  fetchedAt: string;
  /** True for an older client cache or a last-good result after a failed fetch. */
  stale?: boolean;
  /** Set (with empty items) when the fetch failed and nothing cached could stand in —
   *  delivered as a cacheable 200 so a dead source doesn't hit the server per load. */
  error?: string;
}

export interface CustomFeed {
  id: string; // `custom:<ts36>`
  source: SourceId;
  label: string;
  /** Spread into the query string — always explicit, so custom feeds are category-independent. */
  params: Record<string, string>;
}

export interface Prefs {
  v: 10;
  contentMode: ContentMode;
  followedTopics: CategoryId[];
  mutedAuthors: string[];
  mutedOutlets: string[];
  category: CategoryId;
  /** Hidden feed ids (built-in SourceIds, panel ids, or custom ids). */
  hidden: string[];
  custom: CustomFeed[];
  /** Auto-refresh cadence in ms; 0 disables. Must be one of REFRESH_OPTIONS. */
  refreshMs: number;
  textScale: TextScale;
  sortMode: SortMode;
  view: ViewMode;
  /** Deck order over feed + panel ids — includes hidden ids so toggles don't lose position. */
  order: string[];
  density: Density;
}

/** A feed rendered on the dashboard (built-in or custom). */
export interface VisibleFeed {
  id: string;
  source: SourceId;
  label: string;
  params?: Record<string, string>;
  isCustom: boolean;
}

/** Columns with a dedicated response contract rather than a native source feed. */
export type PanelId = "top10" | "x-discovery";

/** One deck slot: a fetchable feed column or a computed panel. */
export type DeckItem =
  | { kind: "feed"; id: string; feed: VisibleFeed }
  | { kind: "panel"; id: PanelId; label: string };

/* ---------------- /api/brief payload ---------------- */

/** A cross-source story cluster for the Daily Top 10. */
export interface BriefStory {
  id: string;
  title: string;
  /** Best outbound link (representative member's external URL when present). */
  url: string;
  /** Representative discussion permalink when distinct from url. */
  discussUrl?: string;
  /** Distinct sources covering the story, loudest first. */
  sources: SourceId[];
  /** Total comments across members (comparable-ish across sources). */
  comments?: number;
  /** Newest member timestamp (ISO). */
  timestamp: string;
  thumbnail?: string;
  members?: FeedItem[];
  publishers?: string[];
  platforms?: SourceId[];
  reasons?: string[];
  primaryUrl?: string;
  firstPublishedAt?: string;
}

export interface BriefResponse {
  error?: string;
  schemaVersion?: 2;
  health?: FeedHealth;
  phase?: "primary" | "all";
  windowHours?: 24 | 72;
  top10: BriefStory[];
  fetchedAt: string;
  stale?: boolean;
}
