"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cachedFeed, feedUrl, loadFeed } from "./feed-cache";
import { archiveItems } from "./library";
import { getSeenSnapshot, seenKey } from "./use-seen";
import type { CategoryId, FeedItem, FeedResponse, SourceId } from "./types";

export type FeedStatus = "loading" | "ok" | "error";
interface Result { url: string; data: FeedResponse; unseen: FeedItem[]; seenTail: FeedItem[] }
const EMPTY: FeedItem[] = [];
function partition(url: string, data: FeedResponse): Result {
  const seen = getSeenSnapshot();
  return { url, data, unseen: data.items.filter((it) => !seen.has(seenKey(it))), seenTail: data.items.filter((it) => seen.has(seenKey(it))) };
}

export function useFeed(source: SourceId, params: Record<string, string> | undefined, category: CategoryId, refreshKey: number, shouldHold?: () => boolean) {
  const url = feedUrl(source, category, params);
  const [attempt, setAttempt] = useState(0);
  const freshRef = useRef(false);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState<Result | null>(null);
  const [failure, setFailure] = useState<{ url: string; message: string } | null>(null);
  const displayed = useRef(result);
  const hold = useRef(shouldHold);
  useEffect(() => { displayed.current = result; hold.current = shouldHold; });

  useEffect(() => {
    let alive = true;
    const fresh = freshRef.current;
    freshRef.current = false;
    const old = displayed.current?.url === url ? displayed.current : null;
    const cached = cachedFeed<FeedResponse>(url);
    // Cached application is asynchronous like the network response.
    void Promise.resolve().then(() => {
      if (!alive) return;
      if (!old && cached) setResult(partition(url, cached));
      setPending(null);
      setFailure(null);
    });
    loadFeed<FeedResponse>(url, fresh).then((data) => {
      if (!alive) return;
      void archiveItems(data.items);
      const next = partition(url, data);
      if (old && !fresh && hold.current?.()) setPending(next);
      else setResult(next);
    }).catch((error) => {
      if (alive) setFailure({ url, message: error instanceof Error ? error.message : "Fetch failed" });
    });
    return () => { alive = false; };
  }, [url, refreshKey, attempt]);

  const current = result?.url === url ? result : null;
  const parked = pending?.url === url ? pending : null;
  const onScreen = new Set(current?.data.items.map(seenKey));
  const pendingCount = parked?.unseen.filter((it) => !onScreen.has(seenKey(it))).length ?? 0;
  const refetch = useCallback((fresh = false) => { freshRef.current = fresh; setAttempt((a) => a + 1); }, []);
  const apply = useCallback(() => { if (pending) { setResult(partition(pending.url, pending.data)); setPending(null); } }, [pending]);
  const error = failure?.url === url ? failure.message : null;
  return {
    unseen: current?.unseen ?? EMPTY, seenTail: current?.seenTail ?? EMPTY,
    status: (current ? "ok" : error ? "error" : "loading") as FeedStatus,
    error, stale: Boolean(current?.data.stale || current?.data.health?.degraded || (current && error)), fetchedAt: current?.data.fetchedAt ?? null,
    health: current?.data.health,
    pendingCount, apply, refetch, requestKey: url,
  };
}
