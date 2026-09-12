import type { FeedHealth } from "./types";

export interface XDiscoveryMention {
  source: "hackernews" | "latent-space";
  sourceUrl: string;
  sourceTitle: string;
  /** Publication time of the source sharing this link, not the X post. */
  sharedAt: string;
  points?: number;
  comments?: number;
}

export interface XDiscoveryPost {
  /** Canonical X post ID, shared across x.com/twitter.com and handle changes. */
  id: string;
  url: string;
  author: string;
  /** Attributed source context; not a fetched transcript of the X post. */
  title: string;
  excerpt?: string;
  sharedAt: string;
  mentions: XDiscoveryMention[];
  reasons: string[];
  rank: number;
}

export interface XDiscoveryResponse {
  schemaVersion: 1;
  items: XDiscoveryPost[];
  fetchedAt: string;
  health: FeedHealth;
  stale?: boolean;
  error?: string;
}
