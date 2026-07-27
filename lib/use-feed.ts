"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CategoryId, FeedItem, SourceId } from "./types";

export type FeedStatus = "loading" | "ok" | "error";

/**
 * Fetches one column's items. Status is derived from whether the latest result
 * matches the current request key, so switching category/params flips straight
 * back to "loading" without imperatively resetting state. `refetch(true)` does
 * a cache-busting fetch (fresh=1) for manual per-column refreshes.
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

  const [result, setResult] = useState<{ key: string; items: FeedItem[] } | null>(null);
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
        setResult({ key: requestKey, items: data.items });
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setFailure({ key: requestKey, message: e instanceof Error ? e.message : "Fetch failed" });
      }
    })();
    return () => ctrl.abort();
    // requestKey encodes every input below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const items = result?.key === requestKey ? result.items : [];
  const error = failure?.key === requestKey ? failure.message : null;
  const status: FeedStatus = error ? "error" : result?.key === requestKey ? "ok" : "loading";

  const refetch = useCallback((fresh = false) => {
    freshRef.current = fresh;
    setAttempt((a) => a + 1);
  }, []);

  return { items, status, error, refetch };
}
