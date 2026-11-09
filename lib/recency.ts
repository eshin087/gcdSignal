import type { FeedItem, SourceId } from "./types";

const HOUR = 3600_000;

/**
 * All AI columns show the last 72 hours. Papers arrive in weekday batches, so a
 * fixed 72-hour cutoff empties that column every weekend and holiday: its newest
 * batch stays visible instead, for at most seven days.
 */
export function trendingFloor(source: SourceId, items: FeedItem[], now = Date.now()): number {
  const floor = now - 72 * HOUR;
  if (source !== "papers") return floor;
  let newest = -Infinity;
  for (const item of items) {
    const time = Date.parse(item.timestamp);
    if (Number.isFinite(time) && time > newest) newest = time;
  }
  if (!Number.isFinite(newest)) return floor;
  return Math.max(now - 168 * HOUR, Math.min(floor, newest - 24 * HOUR));
}
