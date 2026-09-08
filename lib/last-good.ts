import { BoundedServerCache } from "./bounded-server-cache";

/**
 * Bounded last-known-good fallback for warm serverless instances. Cold instances
 * have no fallback; clients retain their own last-good snapshot. Never pretend
 * this is durable cross-region storage.
 */
const store = new BoundedServerCache<{ value: unknown; at: number }>();
const TTL_MS = 24 * 3600_000;

export function rememberGood<T>(key: string, value: T): void {
  store.set(key, { value, at: Date.now() }, TTL_MS);
}
export function recallGood<T>(key: string): { value: T; at: number } | null {
  const hit = store.get(key);
  return hit ? { value: hit.value as T, at: hit.at } : null;
}
