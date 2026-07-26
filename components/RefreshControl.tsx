"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/fetch-helpers";
import { RefreshIcon } from "./icons";

export default function RefreshControl({
  lastRefreshAt,
  onRefresh,
}: {
  lastRefreshAt: number | null;
  onRefresh: () => void;
}) {
  // Tick to keep the relative time fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <button
      onClick={onRefresh}
      title="Refresh all feeds"
      className="flex items-center gap-1.5 rounded p-1.5 text-zinc-500 transition-colors hover:bg-black/[0.05] hover:text-zinc-700 dark:hover:bg-white/[0.06] dark:hover:text-zinc-300"
    >
      <RefreshIcon className="h-3.5 w-3.5" />
      {lastRefreshAt && (
        <span className="hidden text-[11px] tabular-nums sm:inline">
          {timeAgo(new Date(lastRefreshAt).toISOString())}
        </span>
      )}
    </button>
  );
}
