import type { FeedHealth, FeedItem, SourceHealth } from "./types";

const attached = new WeakMap<FeedItem[], FeedHealth>();
export function summarizeHealth(details: SourceHealth[]): FeedHealth {
  const succeeded = details.filter((entry) => entry.status === "ok").length;
  return { total: details.length, succeeded, failed: details.length - succeeded, degraded: succeeded !== details.length, details };
}
export function healthDetail(id: string, status: "ok" | "error" | "stale", lastSuccessAt?: string): SourceHealth {
  const checkedAt = new Date().toISOString();
  return { id, status, checkedAt, lastSuccessAt: status === "ok" ? checkedAt : lastSuccessAt,
    ...(status !== "ok" ? { message: status === "stale" ? "Showing previous successful data" : "Publisher temporarily unavailable" } : {}) };
}
export function attachHealth(items: FeedItem[], details: SourceHealth[]): FeedItem[] {
  attached.set(items, summarizeHealth(details));
  return items;
}
export function sourceHealth(items: FeedItem[], source: string): FeedHealth {
  const existing = attached.get(items);
  if (existing) return existing;
  const health = summarizeHealth([healthDetail(source, "ok")]);
  attached.set(items, health);
  return health;
}
