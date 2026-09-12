"use client";

import { addToReadingQueue, useReadingQueue } from "@/lib/reading-queue";

/** A short-lived reading list, deliberately separate from permanent saves. */
export default function QueueButton({ id, title, url, source }: { id: string; title: string; url: string; source: string }) {
  const { items, ready } = useReadingQueue();
  const queued = items.some((item) => item.id === id || item.url === url);
  return <button className="story-action" aria-label={queued ? "In Must read" : "Add to Must read"} aria-pressed={queued} disabled={!ready || queued}
    onClick={() => addToReadingQueue({ id, title, url, source })}>{queued ? "In Must read ✓" : "Add to Must read"}</button>;
}
