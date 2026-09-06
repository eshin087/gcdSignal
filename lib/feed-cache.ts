import type { BriefResponse, FeedResponse } from "./types";

type Payload = FeedResponse | BriefResponse;
interface Entry { data: Payload; at: number }
const KEY = "gcdsignal:feed-cache:v1";
const MAX_ENTRIES = 24;
const TTL = 24 * 3600000;
const FRESH_MS = 60000;
const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<Payload>>();
let hydrated = false;
let persistTimer: ReturnType<typeof setTimeout> | undefined;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(rows)) return;
    for (const row of rows.slice(-MAX_ENTRIES)) {
      if (!Array.isArray(row) || row.length !== 2) continue;
      const [url, entry] = row;
      if (typeof url === "string" && url.startsWith("/api/") && entry && typeof entry.at === "number"
        && Date.now() - entry.at < TTL && entry.at <= Date.now() && entry.data
        && (Array.isArray(entry.data.items) || Array.isArray(entry.data.top10))) memory.set(url, entry);
    }
  } catch { /* Storage may be disabled. */ }
}

function remember(url: string, data: Payload) {
  memory.delete(url);
  memory.set(url, { data, at: Date.now() });
  while (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value!);
  if (typeof window === "undefined") return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      const rows = [...memory].filter(([, entry]) => Date.now() - entry.at < TTL);
      let json = JSON.stringify(rows);
      while (json.length > 750000 && rows.length) { rows.shift(); json = JSON.stringify(rows); }
      localStorage.setItem(KEY, json);
    } catch { /* Memory cache still works. */ }
  }, 250);
}

export function cachedFeed<T extends Payload>(url: string): T | null {
  hydrate();
  const entry = memory.get(url);
  if (!entry || Date.now() - entry.at >= TTL) return null;
  return { ...entry.data, stale: entry.data.stale || Date.now() - entry.at >= FRESH_MS } as T;
}

/** Shared by all views. No personal preferences are sent to the server. */
export function loadFeed<T extends Payload>(url: string, fresh = false): Promise<T> {
  hydrate();
  const entry = memory.get(url);
  if (!fresh && entry && !entry.data.stale && Date.now() - entry.at < FRESH_MS) return Promise.resolve(entry.data as T);
  const key = `${url}|${fresh}`;
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const task = (async () => {
    try {
      const response = await fetch(`${url}${fresh ? `${url.includes("?") ? "&" : "?"}fresh=1` : ""}`, { signal: AbortSignal.timeout(30000) });
      const data = await response.json();
      if (!response.ok || data.error || (!Array.isArray(data.items) && !Array.isArray(data.top10))) throw new Error(data.error ?? `HTTP ${response.status}`);
      remember(url, data);
      return data as T;
    } catch (error) {
      const previous = cachedFeed<T>(url);
      if (previous) return { ...previous, stale: true };
      throw error;
    }
  })();
  inflight.set(key, task);
  void task.then(() => inflight.delete(key), () => inflight.delete(key));
  return task;
}

export function feedUrl(source: string, category: string, params?: Record<string, string>): string {
  const query = new URLSearchParams({ category, ...params });
  query.sort();
  return `/api/feeds/${source}?${query}`;
}
