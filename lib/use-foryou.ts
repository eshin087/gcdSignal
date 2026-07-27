"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSeenSnapshot, seenKey } from "./use-seen";
import type { CategoryId, FeedItem, VisibleFeed } from "./types";

export interface ForYouSource {
  feedId: string;
  label: string;
  unseen: FeedItem[];
  seenTail: FeedItem[];
}

export interface ForYouFailure {
  label: string;
  message: string;
}

const EMPTY_SOURCES: ForYouSource[] = [];
const EMPTY_FAILURES: ForYouFailure[] = [];

/**
 * Fetches every visible feed itself (same CDN-cached routes the deck uses, so
 * toggling views within 5 minutes is near-free) and partitions ALL sources
 * against ONE seen-snapshot — the doomscroll invariant holds across the mix.
 */
export function useForYou(feeds: VisibleFeed[], category: CategoryId, refreshKey: number) {
  const feedsKey = JSON.stringify(
    feeds.map((f) => [f.id, f.source, f.label, f.params ?? {}, f.isCustom])
  );
  const [attempt, setAttempt] = useState(0);
  const freshRef = useRef(false);
  const requestKey = `${feedsKey}|${category}|${refreshKey}|${attempt}`;

  const [result, setResult] = useState<{
    key: string;
    perSource: ForYouSource[];
    failures: ForYouFailure[];
  } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const wantFresh = freshRef.current;
    freshRef.current = false;
    const feedList = JSON.parse(feedsKey) as Array<
      [string, string, string, Record<string, string>, boolean]
    >;
    (async () => {
      const settled = await Promise.allSettled(
        feedList.map(async ([id, source, label, params, isCustom]) => {
          const qs = new URLSearchParams({
            // Custom feeds are pinned — same rule as FeedColumn.
            category: isCustom ? "trending" : category,
            ...params,
          });
          if (wantFresh) qs.set("fresh", "1");
          const res = await fetch(`/api/feeds/${source}?${qs}`, { signal: ctrl.signal });
          const data = (await res.json()) as { items?: FeedItem[]; error?: string };
          if (!res.ok || !data.items) throw new Error(data.error ?? `HTTP ${res.status}`);
          return { id, label, items: data.items };
        })
      );
      if (ctrl.signal.aborted) return;

      const seen = getSeenSnapshot();
      const perSource: ForYouSource[] = [];
      const failures: ForYouFailure[] = [];
      settled.forEach((r, i) => {
        if (r.status === "fulfilled") {
          const unseen: FeedItem[] = [];
          const seenTail: FeedItem[] = [];
          for (const item of r.value.items) {
            (seen.has(seenKey(item)) ? seenTail : unseen).push(item);
          }
          perSource.push({ feedId: r.value.id, label: r.value.label, unseen, seenTail });
        } else {
          failures.push({
            label: feedList[i][2],
            message: r.reason instanceof Error ? r.reason.message : "Fetch failed",
          });
        }
      });
      setResult({ key: requestKey, perSource, failures });
    })();
    return () => ctrl.abort();
    // requestKey encodes every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const current = result?.key === requestKey ? result : null;
  const perSource = current?.perSource ?? EMPTY_SOURCES;
  const failures = current?.failures ?? EMPTY_FAILURES;
  const status: "loading" | "ok" | "error" = !current
    ? "loading"
    : perSource.length
      ? "ok"
      : "error";

  const refetch = useCallback((fresh = false) => {
    freshRef.current = fresh;
    setAttempt((a) => a + 1);
  }, []);

  return { perSource, failures, status, refetch, requestKey };
}
