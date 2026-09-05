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

interface Fetched {
  id: string;
  label: string;
  items: FeedItem[];
  stale: boolean;
}

interface Result {
  key: string;
  perSource: ForYouSource[];
  failures: ForYouFailure[];
  staleLabels: string[];
}

interface Pending {
  key: string;
  fetched: Fetched[];
  failures: ForYouFailure[];
  newCount: number;
}

const EMPTY_SOURCES: ForYouSource[] = [];
const EMPTY_FAILURES: ForYouFailure[] = [];
const EMPTY_STALE: string[] = [];

function partition(key: string, fetched: Fetched[], failures: ForYouFailure[]): Result {
  const seen = getSeenSnapshot();
  const perSource: ForYouSource[] = [];
  const staleLabels: string[] = [];
  for (const f of fetched) {
    const unseen: FeedItem[] = [];
    const seenTail: FeedItem[] = [];
    for (const item of f.items) {
      (seen.has(seenKey(item)) ? seenTail : unseen).push(item);
    }
    perSource.push({ feedId: f.id, label: f.label, unseen, seenTail });
    if (f.stale) staleLabels.push(f.label);
  }
  return { key, perSource, failures, staleLabels };
}

/**
 * Fetches every visible feed itself (same CDN-cached routes the deck uses, so
 * toggling views within 5 minutes is near-free) and partitions ALL sources
 * against ONE seen-snapshot — the doomscroll invariant holds across the mix.
 * Refresh-triggered results are held as pending while the reader is
 * mid-stream (`shouldHold`), surfaced as an "N new" pill; `apply()` swaps.
 */
export function useForYou(
  feeds: VisibleFeed[],
  category: CategoryId,
  refreshKey: number,
  shouldHold?: () => boolean
) {
  const feedsKey = JSON.stringify(
    feeds.map((f) => [f.id, f.source, f.label, f.params ?? {}, f.isCustom])
  );
  const [attempt, setAttempt] = useState(0);
  const freshRef = useRef(false);
  const base = `${feedsKey}|${category}`;
  const triggerRef = useRef({ base: "", refreshKey: -1, attempt: -1 });
  const requestKey = `${base}|${refreshKey}|${attempt}`;

  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const wantFresh = freshRef.current;
    freshRef.current = false;
    const prev = triggerRef.current;
    const isRefresh =
      prev.base === base && prev.refreshKey !== refreshKey && prev.attempt === attempt;
    triggerRef.current = { base, refreshKey, attempt };
    const displayed = result;
    const feedList = JSON.parse(feedsKey) as Array<
      [string, string, string, Record<string, string>, boolean]
    >;
    (async () => {
      const settled = await Promise.allSettled(
        feedList.map(async ([id, source, label, params, isCustom]): Promise<Fetched> => {
          const qs = new URLSearchParams({
            // Custom feeds are pinned — same rule as FeedColumn.
            category: isCustom ? "trending" : category,
            ...params,
          });
          if (wantFresh) qs.set("fresh", "1");
          const res = await fetch(`/api/feeds/${source}?${qs}`, { signal: ctrl.signal });
          const data = (await res.json()) as {
            items?: FeedItem[];
            error?: string;
            stale?: boolean;
          };
          if (!res.ok || data.error || !data.items) {
            throw new Error(data.error ?? `HTTP ${res.status}`);
          }
          return { id, label, items: data.items, stale: Boolean(data.stale) };
        })
      );
      if (ctrl.signal.aborted) return;

      const fetched: Fetched[] = [];
      const failures: ForYouFailure[] = [];
      settled.forEach((r, i) => {
        if (r.status === "fulfilled") fetched.push(r.value);
        else {
          failures.push({
            label: feedList[i][2],
            message: r.reason instanceof Error ? r.reason.message : "Fetch failed",
          });
        }
      });

      if (isRefresh && displayed && shouldHold?.()) {
        const onScreen = new Set(
          displayed.perSource.flatMap((s) => [...s.unseen, ...s.seenTail].map((it) => seenKey(it)))
        );
        const seen = getSeenSnapshot();
        let newCount = 0;
        for (const f of fetched) {
          for (const it of f.items) {
            const k = seenKey(it);
            if (!onScreen.has(k) && !seen.has(k)) newCount++;
          }
        }
        if (newCount > 0) {
          setPending({ key: requestKey, fetched, failures, newCount });
          return;
        }
      }
      setResult(partition(requestKey, fetched, failures));
      setPending(null);
    })();
    return () => ctrl.abort();
    // requestKey encodes every input; `result` is read once for the hold decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const holding = pending?.key === requestKey;
  const current = result && (result.key === requestKey || holding) ? result : null;
  const perSource = current?.perSource ?? EMPTY_SOURCES;
  const failures = current?.failures ?? EMPTY_FAILURES;
  const staleLabels = current?.staleLabels ?? EMPTY_STALE;
  const status: "loading" | "ok" | "error" = !current
    ? "loading"
    : perSource.length
      ? "ok"
      : "error";
  const pendingCount = holding ? pending.newCount : 0;

  const refetch = useCallback((fresh = false) => {
    freshRef.current = fresh;
    setAttempt((a) => a + 1);
  }, []);

  const apply = useCallback(() => {
    if (!pending) return;
    setResult(partition(pending.key, pending.fetched, pending.failures));
    setPending(null);
  }, [pending]);

  return { perSource, failures, staleLabels, status, pendingCount, apply, refetch, requestKey };
}
