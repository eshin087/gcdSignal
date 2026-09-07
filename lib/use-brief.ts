"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cachedFeed, loadFeed } from "./feed-cache";
import type { BriefResponse, CategoryId } from "./types";

function signature(data: BriefResponse) {
  return JSON.stringify(data.top10.map((s) => [s.id, s.members?.map((m) => m.externalUrl ?? m.url)]));
}
export function useBrief(refreshKey: number, windowHours: 24 | 72 = 24, shouldHold?: () => boolean, category: CategoryId = "trending") {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; data: BriefResponse } | null>(null);
  const [pending, setPending] = useState<{ key: string; data: BriefResponse } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const currentRef = useRef(result);
  const hold = useRef(shouldHold);
  const key = category + ":" + windowHours;
  useEffect(() => { currentRef.current = result; hold.current = shouldHold; });
  useEffect(() => {
    let alive = true;
    const url = (phase: "primary" | "all") => "/api/brief?" + new URLSearchParams({ category, phase, window: String(windowHours) });
    const publish = (data: BriefResponse) => {
      if (!alive) return;
      const old = currentRef.current;
      if (old?.key === key && old.data.top10.length && hold.current?.() && signature(old.data) !== signature(data)) {
        setPending({ key, data });
      } else {
        const next = { key, data };
        currentRef.current = next;
        setResult(next);
        setPending(null);
      }
      setFailure(null);
    };
    const cached = cachedFeed<BriefResponse>(url("all")) ?? cachedFeed<BriefResponse>(url("primary"));
    // Cache is usable immediately. Cold loads show reporting before slow social adapters.
    void Promise.resolve().then(async () => {
      if (!alive) return;
      if (cached) publish(cached);
      else {
        try { publish(await loadFeed<BriefResponse>(url("primary"))); }
        catch { /* The complete phase can still have useful coverage. */ }
      }
      if (!alive) return;
      try { publish(await loadFeed<BriefResponse>(url("all"), attempt > 0)); }
      catch (error) {
        if (alive) setFailure({ key, message: error instanceof Error ? error.message : "Brief unavailable" });
      }
    });
    return () => { alive = false; };
  }, [refreshKey, attempt, key, category, windowHours]);
  const data = result?.key === key ? result.data : null;
  const parked = pending?.key === key ? pending.data : null;
  const refetch = useCallback(() => setAttempt((n) => n + 1), []);
  const apply = useCallback(() => {
    if (!pending) return;
    currentRef.current = pending;
    setResult(pending);
    setPending(null);
  }, [pending]);
  const error = failure?.key === key ? failure.message : null;
  return { data, status: data ? "ok" as const : error ? "error" as const : "loading" as const,
    error, refetch, pending: parked, apply };
}
