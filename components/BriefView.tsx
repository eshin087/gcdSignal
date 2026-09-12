"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBrief } from "@/lib/use-brief";
import { SOURCE_LABELS } from "@/lib/feeds";
import { stableStoryId } from "@/lib/stories";
import { followedBriefRecords, storyProgress, visibleBriefStory } from "@/lib/story-progress";
import { usePrefs } from "@/lib/use-prefs";
import { useLibrary, useArchiveItems, markRead, setDismissed, toggleFollowStory } from "@/lib/use-library";
import { toggleSaved, useSavedKeys } from "@/lib/use-saved";
import type { BriefStory, CategoryId, FeedItem } from "@/lib/types";
import { useReading } from "./ReadingContext";
import CoveragePanel from "./CoveragePanel";

const EMPTY: FeedItem[] = [];
export default function BriefView({ refreshKey, category }: { refreshKey: number; category: CategoryId }) {
  const { prefs, setPrefs } = usePrefs();
  const [windowHours, setWindowHours] = useState<24 | 72>(24);
  const [catchupOnly, setCatchupOnly] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { scroll.current?.scrollTo({ top: 0, behavior: "instant" }); }, [category, windowHours]);
  const { data, status, error, refetch, pending, apply } = useBrief(refreshKey, windowHours, () => (scroll.current?.scrollTop ?? 0) > 80, category);
  const library = useLibrary();
  const saved = useSavedKeys();
  const read = useReading();
  const allItems = useMemo(() => data?.top10.flatMap((story) => story.members ?? []) ?? EMPTY, [data]);
  useArchiveItems(allItems);
  const records = useMemo(() => new Map(library.records.map((r) => [r.storyId, r])), [library.records]);
  const stories = (data?.top10 ?? []).flatMap((story): BriefStory[] => {
    const visible = visibleBriefStory(story, prefs, category, records, windowHours);
    return visible ? [visible] : [];
  });
  const arrivalBoundary = library.previousVisitAt === null ? null : library.sessionStartedAt;
  const isNew = (story: BriefStory) => storyProgress(story, records, arrivalBoundary).isNew;
  const display = catchupOnly ? stories.filter(isNew) : stories;
  const snapshotAt = data?.fetchedAt ? Date.parse(data.fetchedAt) : library.sessionStartedAt;
  const followed = followedBriefRecords(library.records, prefs, library.followedTerms, snapshotAt);

  return <main ref={scroll} className="feed-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label="Essential Brief">
    <div className="reader-page mx-auto max-w-[850px] px-4 pb-12 pt-4 sm:px-8 sm:pt-9">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><p className="reader-eyebrow">Your AI reading room <span className="sm:hidden">· {windowHours}h</span></p><h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">The essential Brief</h1>
          <p className="mt-2 hidden max-w-xl text-sm leading-6 text-zinc-600 sm:block dark:text-zinc-400">Major developments. Original sources. A clear place to stop.</p></div>
        <div className="hidden sm:block"><button className="action-button" onClick={() => refetch()} disabled={status === "loading"}>Refresh</button></div>
      </div>
      <CoveragePanel health={data?.health} stale={data?.stale || Boolean(error && data)} fetchedAt={data?.fetchedAt} phase={data?.phase} />
      <div className="my-4 flex flex-wrap items-center gap-2">
        <button className="action-button" aria-pressed={!catchupOnly} onClick={() => setCatchupOnly(false)}>Essential</button>
        <button className="action-button" aria-pressed={catchupOnly} onClick={() => setCatchupOnly(true)}>Since your last visit{library.previousVisitAt ? " · " + stories.filter(isNew).length : ""}</button>
        <span className="ml-auto hidden text-xs text-zinc-600 sm:inline dark:text-zinc-400">Last {windowHours} hours</span>
        <div className="ml-auto sm:hidden"><button className="action-button" onClick={() => refetch()} disabled={status === "loading"}>Refresh</button></div>
      </div>
      {prefs.contentMode === "builder" && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/30">Builder filter is on. <button className="underline" onClick={() => setPrefs((p) => ({ ...p, contentMode: "broad" }))}>Show broad AI news</button></p>}
      {pending && <div className="sticky top-2 z-10 mb-3 flex justify-center"><button className="action-button reader-primary shadow-md" onClick={() => { apply(); scroll.current?.scrollTo({ top: 0, behavior: "instant" }); }}>New coverage available · Update brief</button></div>}
      {status === "loading" && <div role="status" className="space-y-6 py-6"><p className="text-sm text-zinc-600 dark:text-zinc-400">Gathering reporting and original sources…</p>{[1, 2, 3].map((n) => <div key={n} className="space-y-3"><div className="skeleton h-5 w-4/5" /><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-2/3" /></div>)}</div>}
      {error && <p role="status" className="my-4 text-sm text-amber-800 dark:text-amber-300">Could not refresh all coverage. {data ? "Your cached brief remains available." : "Try again shortly, or open your Library."}</p>}
      {display.map((story, index) => {
        const members = story.members!;
        const first = members[0];
        const record = records.get(stableStoryId(first));
        const progress = storyProgress(story, records, arrivalBoundary);
        const readAlready = progress.read;
        const additional = progress.additional;
        return <article key={story.id} data-item-key={story.id} tabIndex={-1} className={"brief-story border-b border-zinc-200 dark:border-zinc-800 " + (index === 0 ? "pb-6 pt-1" : "py-6")}>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-mono">{String(index + 1).padStart(2, "0")}</span>
            <span>{first.curation?.kind ?? "AI news"}</span><span aria-hidden>·</span>
            <time dateTime={story.firstPublishedAt ?? first.timestamp}>{new Date(story.firstPublishedAt ?? first.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>
            {isNew(story) && <span className="text-teal-700 dark:text-teal-300">New to you</span>}
            {additional && <span>Additional coverage</span>}
            {readAlready && <span>Read</span>}
          </div>
          <h2 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl"><a className="hover:text-teal-700 dark:hover:text-teal-300" href={story.primaryUrl ?? story.url} target="_blank" rel="noopener noreferrer" onClick={() => markRead(members)}>{story.title}</a></h2>
          {first.excerpt && <p className="reader-excerpt mt-3 leading-relaxed text-zinc-600 dark:text-zinc-300">{first.excerpt.slice(0, 450)}</p>}
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{first.excerpt ? "Excerpt" : "Via"} · {first.sourceMeta ?? SOURCE_LABELS[first.source]}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <span>{story.publishers?.length ?? 0} reporting {story.publishers?.length === 1 ? "publisher" : "publishers"}</span>
            {!!story.platforms?.length && <span>· {story.platforms.length} discussion {story.platforms.length === 1 ? "platform" : "platforms"}</span>}
            {story.primaryUrl && <a href={story.primaryUrl} target="_blank" rel="noopener noreferrer" className="underline">Primary source ↗</a>}
          </div>
          <details className="mt-2 text-xs text-zinc-600 dark:text-zinc-400"><summary className="cursor-pointer py-2">Why selected?</summary><ul className="list-inside list-disc space-y-1">{(story.reasons ?? ["Selected from recent AI reporting."]).map((reason) => <li key={reason}>{reason}</li>)}</ul><p className="mt-2">Rule-based selection, not verification of claims.</p></details>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button className="action-button" onClick={() => read(members)}>Sources & discussion</button>
            <button className="action-button" aria-label={saved.has(stableStoryId(first)) ? "Remove from saved" : "Save story"} aria-pressed={saved.has(stableStoryId(first))} onClick={() => toggleSaved(first)}>{saved.has(stableStoryId(first)) ? "Saved" : "Save"}</button>
            <button className="action-button" onClick={() => markRead(members, !readAlready)}>{readAlready ? "Mark unread" : "Mark read"}</button>
            <button className="action-button" aria-pressed={Boolean(record?.followedAt)} onClick={() => toggleFollowStory(first)}>{record?.followedAt ? "Following" : "Follow story"}</button>
            <button className="action-button" onClick={() => members.forEach((item) => setDismissed(item, true))}>Dismiss</button>
          </div>
        </article>;
      })}
      {status !== "loading" && display.length === 0 && <div className="rounded-xl border border-dashed border-zinc-300 px-5 py-10 text-center dark:border-zinc-700">
        <h2 className="text-lg font-semibold">{catchupOnly ? "You’re caught up on this brief" : "No matching developments in this window"}</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{catchupOnly ? "This is the essential-story selection, not every post. Your Library keeps the wider collection." : "We won’t fill the list with unrelated posts. Try a longer window, another category, or the source deck."}</p>
      </div>}
      {status !== "loading" && <div className="py-6 text-center">
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">{display.length ? "That’s the brief. Dig deeper only when you want to." : "Broader coverage remains available."}</p>
        <button className="action-button" onClick={() => { setWindowHours(windowHours === 24 ? 72 : 24); setCatchupOnly(false); }}>{windowHours === 24 ? "Expand to the last 72 hours" : "Return to the last 24 hours"}</button>
      </div>}
      {!!followed.length && <section className="mt-4 rounded-xl bg-zinc-100 p-5 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Following</h2><p className="mb-3 mt-1 text-xs text-zinc-600 dark:text-zinc-400">Recent stories from your collected items, matching followed stories, companies, and topics.</p>
        {followed.map((r) => <button key={r.storyId} className="block w-full border-t border-zinc-200 py-3 text-left text-sm hover:underline dark:border-zinc-800" onClick={() => read([r.item])}>{r.item.title}</button>)}
      </section>}
      <aside className="mt-8 text-xs text-zinc-600 dark:text-zinc-400"><p className="mb-2 font-medium">Direct newsrooms · external links, not live integrations</p><div className="flex gap-4"><a href="https://www.anthropic.com/news" target="_blank" rel="noopener noreferrer" className="underline">Anthropic ↗</a><a href="https://blogs.microsoft.com/ai/" target="_blank" rel="noopener noreferrer" className="underline">Microsoft AI ↗</a></div></aside>
    </div>
  </main>;
}
