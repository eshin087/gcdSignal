"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSeenSnapshot, seenKey } from "./use-seen";
import type { CategoryId, FeedItem, SourceId } from "./types";

export type FeedStatus = "loading" | "ok" | "error";

const EMPTY: FeedItem[] = [];

/**
 * Fetches one column's pool and partitions it against the seen-set ONCE, at
 * result arrival — so the rendered list stays stable while the user scrolls
 * and marks accumulate. The next fetch (manual, auto, category switch) applies
 * the updated seen-set: that is the "seen items disappear on refresh" rule.
 * `refetch(true)` does a cache-busting fetch (fresh=1).
 */
export function useFeed(
  source: SourceId,
  params: Record<string, string> | undefined,
  category: CategoryId,
  refreshKey: number
) {
  const paramsKey = JSON.stringify(params ?? {});
  const [attempt, setAttempt] = useState(0);
  const freshRef = useRef(false);
  const requestKey = `${source}|${paramsKey}|${category}|${refreshKey}|${attempt}`;

  const [result, setResult] = useState<{
    key: string;
    unseen: FeedItem[];
    seenTail: FeedItem[];
  } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const wantFresh = freshRef.current;
    freshRef.current = false;
    (async () => {
      try {
        const qs = new URLSearchParams({
          category,
          ...(JSON.parse(paramsKey) as Record<string, string>),
        });
        if (wantFresh) qs.set("fresh", "1");
        const res = await fetch(`/api/feeds/${source}?${qs}`, { signal: ctrl.signal });
        const data = (await res.json()) as { items?: FeedItem[]; error?: string };
        if (!res.ok || !data.items) throw new Error(data.error ?? `HTTP ${res.status}`);
        // Snapshot-at-fetch: partition once against the current seen-set.
        const seen = getSeenSnapshot();
        const unseen: FeedItem[] = [];
        const seenTail: FeedItem[] = [];
        for (const item of data.items) {
          (seen.has(seenKey(item)) ? seenTail : unseen).push(item);
        }
        setResult({ key: requestKey, unseen, seenTail });
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setFailure({ key: requestKey, message: e instanceof Error ? e.message : "Fetch failed" });
      }
    })();
    return () => ctrl.abort();
    // requestKey encodes every input below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const unseen = result?.key === requestKey ? result.unseen : EMPTY;
  const seenTail = result?.key === requestKey ? result.seenTail : EMPTY;
  const error = failure?.key === requestKey ? failure.message : null;
  const status: FeedStatus = error ? "error" : result?.key === requestKey ? "ok" : "loading";

  const refetch = useCallback((fresh = false) => {
    freshRef.current = fresh;
    setAttempt((a) => a + 1);
  }, []);

  return { unseen, seenTail, status, error, refetch, requestKey };
}
