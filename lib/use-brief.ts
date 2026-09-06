"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cachedFeed, loadFeed } from "./feed-cache";
import type { BriefResponse } from "./types";

export function useBrief(refreshKey: number) {
  const [attempt, setAttempt] = useState(0);
  const freshRef = useRef(false);
  const [data, setData] = useState<BriefResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const fresh = freshRef.current;
    freshRef.current = false;
    const cached = cachedFeed<BriefResponse>("/api/brief");
    void Promise.resolve().then(() => { if (alive && cached) setData((old) => old ?? cached); });
    loadFeed<BriefResponse>("/api/brief", fresh).then((next) => {
      if (alive) { setData(next); setError(null); }
    }).catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Fetch failed"); });
    return () => { alive = false; };
  }, [refreshKey, attempt]);
  const refetch = useCallback((fresh = false) => { freshRef.current = fresh; setAttempt((a) => a + 1); }, []);
  return { data, status: data ? "ok" as const : error ? "error" as const : "loading" as const, error, refetch };
}
