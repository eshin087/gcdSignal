"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BriefResponse } from "./types";

// Both panels (Top 10 + Momentum) read the same payload — dedupe concurrent
// identical requests at module level so mounting them costs one fetch.
const inflight = new Map<string, Promise<BriefResponse>>();

function load(dedupeKey: string, fresh: boolean): Promise<BriefResponse> {
  const existing = inflight.get(dedupeKey);
  if (existing) return existing;
  const p = (async () => {
    const res = await fetch(`/api/brief${fresh ? "?fresh=1" : ""}`);
    const data = (await res.json()) as Partial<BriefResponse> & { error?: string };
    if (!res.ok || !Array.isArray(data.top10) || !Array.isArray(data.momentum)) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    return data as BriefResponse;
  })();
  inflight.set(dedupeKey, p);
  p.catch(() => {}).finally(() => {
    setTimeout(() => inflight.delete(dedupeKey), 10_000);
  });
  return p;
}

export function useBrief(refreshKey: number) {
  const [attempt, setAttempt] = useState(0);
  const freshRef = useRef(false);
  const requestKey = `${refreshKey}|${attempt}`;

  const [result, setResult] = useState<{ key: string; data: BriefResponse } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const wantFresh = freshRef.current;
    freshRef.current = false;
    load(`${requestKey}|${wantFresh ? "f" : ""}`, wantFresh)
      .then((data) => {
        if (alive) setResult({ key: requestKey, data });
      })
      .catch((e) => {
        if (alive) {
          setFailure({ key: requestKey, message: e instanceof Error ? e.message : "Fetch failed" });
        }
      });
    return () => {
      alive = false;
    };
  }, [requestKey]);

  const data = result?.key === requestKey ? result.data : null;
  const error = failure?.key === requestKey ? failure.message : null;
  const status: "loading" | "ok" | "error" = error ? "error" : data ? "ok" : "loading";

  const refetch = useCallback((fresh = false) => {
    freshRef.current = fresh;
    setAttempt((a) => a + 1);
  }, []);

  return { data, status, error, refetch };
}
