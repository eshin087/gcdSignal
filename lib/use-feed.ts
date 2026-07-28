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
const AUTO_RETRY_MAX = 2;
const AUTO_RETRY_BASE_MS = 8000;

export function useFeed(
  source: SourceId,
  params: Record<string, string> | undefined,
  category: CategoryId,
  refreshKey: number
) {
  const paramsKey = JSON.stringify(params ?? {});
  const [attempt, setAttempt] = useState(0);
  const freshRef = useRef(false);
  // Silent-retry budget, reset whenever the real inputs (not the attempt
  // counter) change — so a Reddit blip self-heals without a manual refresh,
  // but a persistently dead feed stops after two tries.
  const generation = `${source}|${paramsKey}|${category}|${refreshKey}`;
  const autoRetryRef = useRef({ generation: "", used: 0 });
  const requestKey = `${generation}|${attempt}`;

  const [result, setResult] = useState<{
    key: string;
    unseen: FeedItem[];
    seenTail: FeedItem[];
    stale: boolean;
    fetchedAt: string | null;
  } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const wantFresh = freshRef.current;
    freshRef.current = false;
    if (autoRetryRef.current.generation !== generation) {
      autoRetryRef.current = { generation, used: 0 };
    }
    (async () => {
      try {
        const qs = new URLSearchParams({
          category,
          ...(JSON.parse(paramsKey) as Record<string, string>),
        });
        if (wantFresh) qs.set("fresh", "1");
        const res = await fetch(`/api/feeds/${source}?${qs}`, { signal: ctrl.signal });
        const data = (await res.json()) as {
          items?: FeedItem[];
          error?: string;
          stale?: boolean;
          fetchedAt?: string;
        };
        if (!res.ok || !data.items) throw new Error(data.error ?? `HTTP ${res.status}`);
        // Snapshot-at-fetch: partition once against the current seen-set.
        const seen = getSeenSnapshot();
        const unseen: FeedItem[] = [];
        const seenTail: FeedItem[] = [];
        for (const item of data.items) {
          (seen.has(seenKey(item)) ? seenTail : unseen).push(item);
        }
        setResult({
          key: requestKey,
          unseen,
          seenTail,
          stale: Boolean(data.stale),
          fetchedAt: data.fetchedAt ?? null,
        });
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setFailure({ key: requestKey, message: e instanceof Error ? e.message : "Fetch failed" });
        // Transient upstream blips (Reddit 429s) usually clear in seconds —
        // retry silently through the cheap CDN path before making the user act.
        const retry = autoRetryRef.current;
        if (retry.used < AUTO_RETRY_MAX) {
          retryTimer = setTimeout(() => {
            if (document.hidden) return;
            retry.used++;
            setAttempt((a) => a + 1);
          }, AUTO_RETRY_BASE_MS * (retry.used + 1));
        }
      }
    })();
    return () => {
      ctrl.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
    // requestKey encodes every input below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const current = result?.key === requestKey ? result : null;
  const unseen = current?.unseen ?? EMPTY;
  const seenTail = current?.seenTail ?? EMPTY;
  const stale = current?.stale ?? false;
  const fetchedAt = current?.fetchedAt ?? null;
  const error = failure?.key === requestKey ? failure.message : null;
  const status: FeedStatus = error ? "error" : current ? "ok" : "loading";

  const refetch = useCallback((fresh = false) => {
    freshRef.current = fresh;
    setAttempt((a) => a + 1);
  }, []);

  return { unseen, seenTail, status, error, stale, fetchedAt, refetch, requestKey };
}
