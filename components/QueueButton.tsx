"use client";

import { addToReadingQueue, useReadingQueue } from "@/lib/reading-queue";
import { BookmarkIcon } from "./icons";

/** A short-lived reading list, deliberately separate from permanent saves. */
export default function QueueButton({ id, title, url, source, variant = "text" }: {
  id: string; title: string; url: string; source: string; variant?: "text" | "icon";
}) {
  const { items, ready } = useReadingQueue();
  const queued = items.some((item) => item.id === id || item.url === url);
  const label = queued ? "In Must read" : "Add to Must read";
  const add = () => addToReadingQueue({ id, title, url, source });
  if (variant === "icon") {
    return <button className="story-icon" aria-label={label} title={label} aria-pressed={queued} disabled={!ready || queued} onClick={add}>
      <BookmarkIcon className="h-4 w-4" filled={queued} />
    </button>;
  }
  return <button className="story-action" aria-label={label} aria-pressed={queued} disabled={!ready || queued} onClick={add}>{queued ? "In Must read ✓" : "Add to Must read"}</button>;
}
