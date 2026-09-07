"use client";

import type { FeedHealth } from "@/lib/types";

export default function CoveragePanel({ health, stale, fetchedAt, phase }: {
  health?: FeedHealth; stale?: boolean; fetchedAt?: string; phase?: "primary" | "all";
}) {
  return <details className="coverage-panel rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-[#17191c]">
    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
      <span aria-hidden className={"h-2 w-2 rounded-full " + (stale || health?.degraded ? "bg-amber-500" : health ? "bg-teal-600" : "bg-zinc-400")} />
      <span className="font-medium">{stale ? "Cached coverage" : health?.degraded ? "Partial coverage" : health ? "Source coverage" : "Checking coverage"}</span>
      {health && <span className="text-zinc-600 dark:text-zinc-400">{health.succeeded}/{health.total} available</span>}
      <span className="ml-auto text-xs text-zinc-600 dark:text-zinc-400">Details ▾</span>
    </summary>
    <div className="mt-3 space-y-2 border-t border-zinc-200 pt-3 text-xs dark:border-zinc-700">
      {fetchedAt && <p>Snapshot: {new Date(fetchedAt).toLocaleString()}. This is retrieval time, not the age of every story.</p>}
      {phase === "primary" && <p>Showing reporting first. Additional discussions are still loading.</p>}
      <p>Coverage is not a completeness guarantee or verification of claims. Failed contributors are not counted as healthy.</p>
      {health?.details?.map((d) => <div key={d.id} className="flex flex-wrap justify-between gap-x-3 rounded bg-zinc-50 p-2 dark:bg-zinc-900">
        <span className="break-all font-medium">{d.id}</span>
        <span>{d.status === "ok" ? "Available" : d.status === "stale" ? "Cached" : "Unavailable"}</span>
        {d.lastSuccessAt && <span className="w-full text-zinc-600 dark:text-zinc-400">Last success: {new Date(d.lastSuccessAt).toLocaleString()}</span>}
        {d.message && <span className="w-full text-zinc-600 dark:text-zinc-400">{d.message}</span>}
      </div>)}
    </div>
  </details>;
}
