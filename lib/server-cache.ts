import { BoundedServerCache } from "./bounded-server-cache";

/** Per-instance single-flight + five-minute cache. CDN is shared; this map is not. */
export const SERVER_CACHE_MS = 300_000;
const entries = new BoundedServerCache<unknown>();
const inflight = new Map<string, Promise<unknown>>();
export function canonicalKey(prefix: string, params: Record<string, string>): string {
  return `${prefix}|${JSON.stringify(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)))}`;
}
export function sharedServerLoad<T>(key: string, loader: () => Promise<T>, ttl = SERVER_CACHE_MS): Promise<T> {
  const cached = entries.get(key);
  if (cached !== undefined) return Promise.resolve(cached as T);
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  if (inflight.size >= 64) return Promise.reject(new Error("Feed service is busy"));
  const task = Promise.resolve().then(loader).then((value) => {
    entries.set(key, value, ttl);
    return value;
  });
  inflight.set(key, task);
  task.then(() => inflight.delete(key), () => inflight.delete(key));
  return task;
}
