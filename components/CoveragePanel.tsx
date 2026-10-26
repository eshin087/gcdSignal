"use client";

import type { FeedHealth } from "@/lib/types";

/** Compact coverage status for the Brief toolbar; opening it takes the full row. */
export default function CoveragePanel({ health, stale, fetchedAt, phase, className = "" }: {
  health?: FeedHealth; stale?: boolean; fetchedAt?: string; phase?: "primary" | "all"; className?: string;
}) {
  const tone = stale || health?.degraded ? "bg-amber-500" : health ? "bg-teal-600 dark:bg-teal-400" : "bg-zinc-400";
  const label = stale ? "Cached coverage" : health?.degraded ? "Partial coverage" : health ? "Source coverage" : "Checking coverage";
  return <details className={`coverage-panel min-w-0 text-sm open:basis-full ${className}`}>
    <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
      <span aria-hidden className={"h-2 w-2 shrink-0 rounded-full " + tone} />
      <span className="font-medium">{label}</span>
      {health && <span className="hidden tabular-nums sm:inline">{health.succeeded}/{health.total} sources</span>}
      <span aria-hidden className="text-zinc-400">▾</span>
    </summary>
    <div className="mb-1 space-y-2 rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-[#17191c]">
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
