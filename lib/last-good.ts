/**
 * Warm-lambda "last known good" cache: when an upstream fetch fails (Reddit
 * 429s being the common case), the API routes serve the previous successful
 * result flagged `stale: true` instead of an error. Module-scoped, so it
 * survives across requests on a warm serverless instance — a cold instance
 * simply has nothing to fall back to yet.
 */

interface Entry<T> {
  value: T;
  at: number;
}

const MAX_ENTRIES = 200;
const TTL_MS = 24 * 3600_000;

const store = new Map<string, Entry<unknown>>();

export function rememberGood<T>(key: string, value: T): void {
  store.delete(key); // re-insert to refresh Map iteration order (oldest first)
  store.set(key, { value, at: Date.now() });
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
}

export function recallGood<T>(key: string): { value: T; at: number } | null {
  const hit = store.get(key);
  if (!hit || Date.now() - hit.at > TTL_MS) return null;
  return { value: hit.value as T, at: hit.at };
}
