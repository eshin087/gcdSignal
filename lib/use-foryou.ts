"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cachedFeed, feedUrl, loadFeed } from "./feed-cache";
import { clearHealth, reportHealth } from "./feed-health";
import { getSeenSnapshot, seenKey } from "./use-seen";
import type { CategoryId, FeedItem, FeedResponse, VisibleFeed } from "./types";

export interface ForYouSource { feedId: string; label: string; custom: boolean; unseen: FeedItem[]; seenTail: FeedItem[] }
export interface ForYouFailure { feedId: string; label: string; message: string }
interface Result { key: string; perSource: ForYouSource[]; failures: ForYouFailure[]; staleLabels: string[] }
const EMPTY_SOURCES: ForYouSource[] = [];
const EMPTY_FAILURES: ForYouFailure[] = [];
const EMPTY_STALE: string[] = [];

export function useForYou(feeds: VisibleFeed[], category: CategoryId, refreshKey: number, shouldHold?: () => boolean) {
  const feedsKey = JSON.stringify(feeds);
  const base = category + "|" + feedsKey;
  const [attempt, setAttempt] = useState(0);
  const freshRef = useRef(false);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState<Result | null>(null);
  const displayed = useRef(result);
  const hold = useRef(shouldHold);
  useEffect(() => { displayed.current = result; hold.current = shouldHold; });

  useEffect(() => {
    let alive = true;
    const fresh = freshRef.current;
    freshRef.current = false;
    const feedList: VisibleFeed[] = JSON.parse(feedsKey);
    const fetched = new Map<string, { feed: VisibleFeed; data: FeedResponse }>();
    const failures = new Map<string, ForYouFailure>();
    const seen = getSeenSnapshot();
    const publish = () => {
      if (!alive) return;
      const next: Result = { key: base, perSource: [], failures: [...failures.values()], staleLabels: [] };
      for (const feed of feedList) {
        const data = fetched.get(feed.id)?.data;
        if (!data) continue;
        next.perSource.push({
          feedId: feed.id, label: feed.label, custom: feed.isCustom,
          unseen: data.items.filter((it) => !seen.has(seenKey(it))),
          seenTail: data.items.filter((it) => seen.has(seenKey(it))),
        });
        if (data.stale || data.health?.degraded) next.staleLabels.push(feed.label);
      }
      if (!fresh && displayed.current?.key === base && hold.current?.()) setPending(next);
      else { setResult(next); setPending(null); }
    };
    for (const feed of feedList) {
      const url = feedUrl(feed.source, feed.isCustom ? "trending" : category, feed.params);
      const cached = cachedFeed<FeedResponse>(url);
      if (cached) fetched.set(feed.id, { feed, data: cached });
      reportHealth(feed.id, { status: cached ? cached.stale ? "stale" : "ok" : "loading", count: cached?.items.length ?? 0, fetchedAt: cached?.fetchedAt });
    }
    void Promise.resolve().then(() => { if (fetched.size || !feedList.length) publish(); });
    // Each source publishes independently: no all-sources loading barrier.
    for (const feed of feedList) {
      const url = feedUrl(feed.source, feed.isCustom ? "trending" : category, feed.params);
      void loadFeed<FeedResponse>(url, fresh).then((data) => {
        if (!alive) return;
        fetched.set(feed.id, { feed, data });
        failures.delete(feed.id);
        reportHealth(feed.id, { status: data.stale || data.health?.degraded ? "stale" : "ok", count: data.items.length, fetchedAt: data.fetchedAt });
        publish();
      }).catch((error) => {
        if (!alive) return;
        failures.set(feed.id, { feedId: feed.id, label: feed.label, message: error instanceof Error ? error.message : "Fetch failed" });
        reportHealth(feed.id, { status: "error", count: 0 });
        publish();
      });
    }
    return () => { alive = false; for (const feed of feedList) clearHealth(feed.id); };
  }, [base, feedsKey, category, refreshKey, attempt]);

  const current = result?.key === base ? result : null;
  const parked = pending?.key === base ? pending : null;
  const oldKeys = new Set(current?.perSource.flatMap((s) => [...s.unseen, ...s.seenTail].map(seenKey)));
  const pendingCount = parked?.perSource.flatMap((s) => s.unseen).filter((it) => !oldKeys.has(seenKey(it))).length ?? 0;
  const refetch = useCallback((fresh = false) => { freshRef.current = fresh; setAttempt((a) => a + 1); }, []);
  const apply = useCallback(() => {
    if (!pending) return;
    const seen = getSeenSnapshot();
    setResult({ ...pending, perSource: pending.perSource.map((s) => {
      const all = [...s.unseen, ...s.seenTail];
      return { ...s, unseen: all.filter((it) => !seen.has(seenKey(it))), seenTail: all.filter((it) => seen.has(seenKey(it))) };
    }) });
    setPending(null);
  }, [pending]);
  return {
    perSource: current?.perSource ?? EMPTY_SOURCES,
    failures: current?.failures ?? EMPTY_FAILURES,
    staleLabels: current?.staleLabels ?? EMPTY_STALE,
    status: !current ? "loading" as const : current.perSource.length || !feeds.length ? "ok" as const : current.failures.length === feeds.length ? "error" as const : "loading" as const,
    pendingCount, apply, refetch, requestKey: base,
  };
}
