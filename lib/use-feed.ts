"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSeenSnapshot, seenKey } from "./use-seen";
import type { CategoryId, FeedItem, SourceId } from "./types";

export type FeedStatus = "loading" | "ok" | "error";

const EMPTY: FeedItem[] = [];
const AUTO_RETRY_MAX = 2;
const AUTO_RETRY_BASE_MS = 8000;

interface Partitioned {
  key: string;
  unseen: FeedItem[];
  seenTail: FeedItem[];
  stale: boolean;
  fetchedAt: string | null;
}

interface Pending {
  key: string;
  items: FeedItem[];
  newCount: number;
  stale: boolean;
  fetchedAt: string | null;
}

function partition(key: string, items: FeedItem[], stale: boolean, fetchedAt: string | null): Partitioned {
  // Snapshot-at-fetch: partition once against the current seen-set.
  const seen = getSeenSnapshot();
  const unseen: FeedItem[] = [];
  const seenTail: FeedItem[] = [];
  for (const item of items) {
    (seen.has(seenKey(item)) ? seenTail : unseen).push(item);
  }
  return { key, unseen, seenTail, stale, fetchedAt };
}

/**
 * Fetches one column's pool and partitions it against the seen-set ONCE, at
 * result arrival — so the rendered list stays stable while the user scrolls
 * and marks accumulate. The next fetch (manual, auto, category switch) applies
 * the updated seen-set: that is the "seen items disappear on refresh" rule.
 *
 * Refresh-triggered results (refreshKey bump) are HELD as `pending` when the
 * column reports it is mid-read (`shouldHold`), so an auto-refresh never
 * reflows the list under the reader — the column shows an "N new" pill and
 * `apply()` swaps the pending result in (re-partitioned at that moment).
 * `refetch(true)` does a cache-busting fetch (fresh=1) and always applies.
 */
export function useFeed(
  source: SourceId,
  params: Record<string, string> | undefined,
  category: CategoryId,
  refreshKey: number,
  shouldHold?: () => boolean
) {
  const paramsKey = JSON.stringify(params ?? {});
  const [attempt, setAttempt] = useState(0);
  const freshRef = useRef(false);

  // Silent-retry budget, reset whenever the real inputs (not the attempt
  // counter) change — so a Reddit blip self-heals without a manual refresh,
  // but a persistently dead feed stops after two tries.
  const base = `${source}|${paramsKey}|${category}`;
  const generation = `${base}|${refreshKey}`;
  const autoRetryRef = useRef({ generation: "", used: 0 });
  // Which trigger produced this request: a refreshKey bump on an otherwise
  // unchanged column is a "refresh" and eligible for holding.
  const triggerRef = useRef({ base: "", refreshKey: -1, attempt: -1 });
  const requestKey = `${generation}|${attempt}`;

  const [result, setResult] = useState<Partitioned | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const wantFresh = freshRef.current;
    freshRef.current = false;
    if (autoRetryRef.current.generation !== generation) {
      autoRetryRef.current = { generation, used: 0 };
    }
    const prev = triggerRef.current;
    const isRefresh =
      prev.base === base && prev.refreshKey !== refreshKey && prev.attempt === attempt;
    triggerRef.current = { base, refreshKey, attempt };
    const displayed = result;

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
        // Failures arrive as a cacheable 200 with `error` set (see route.ts).
        if (!res.ok || data.error || !data.items) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        const stale = Boolean(data.stale);
        const fetchedAt = data.fetchedAt ?? null;

        if (isRefresh && displayed && shouldHold?.()) {
          // Hold: count what the reader hasn't got on screen yet.
          const onScreen = new Set(
            [...displayed.unseen, ...displayed.seenTail].map((it) => seenKey(it))
          );
          const seen = getSeenSnapshot();
          const fresh = data.items.filter((it) => {
            const k = seenKey(it);
            return !onScreen.has(k) && !seen.has(k);
          });
          if (fresh.length > 0) {
            setPending({ key: requestKey, items: data.items, newCount: fresh.length, stale, fetchedAt });
            return;
          }
          // Nothing new for them — swap silently (same content, fresher stale flag).
        }
        setResult(partition(requestKey, data.items, stale, fetchedAt));
        setPending(null);
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
    // requestKey encodes every input below; `result` is read once as the
    // currently displayed list for the hold decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  // The displayed result is live if it matches the request, OR if a newer
  // request's result is parked as pending (the reader is mid-column).
  const holding = pending?.key === requestKey;
  const current = result && (result.key === requestKey || holding) ? result : null;
  const unseen = current?.unseen ?? EMPTY;
  const seenTail = current?.seenTail ?? EMPTY;
  const stale = current?.stale ?? false;
  const fetchedAt = current?.fetchedAt ?? null;
  const error = failure?.key === requestKey ? failure.message : null;
  const status: FeedStatus = error ? "error" : current ? "ok" : "loading";
  const pendingCount = holding ? pending.newCount : 0;

  const refetch = useCallback((fresh = false) => {
    freshRef.current = fresh;
    setAttempt((a) => a + 1);
  }, []);

  const apply = useCallback(() => {
    if (!pending) return;
    setResult(partition(pending.key, pending.items, pending.stale, pending.fetchedAt));
    setPending(null);
  }, [pending]);

  return { unseen, seenTail, status, error, stale, fetchedAt, pendingCount, apply, refetch, requestKey };
}
