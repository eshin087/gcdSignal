"use client";

import { classify, authorKey, outletKey, isPrimarySource } from "@/lib/curation";
import { CATEGORIES } from "@/lib/categories";
import { canonicalUrl, discussionPlatform, reportingPublisher, stableStoryId } from "@/lib/stories";
import { useDialog } from "@/lib/use-dialog";
import { usePrefs } from "@/lib/use-prefs";
import { markRead, setDismissed, toggleFollowStory, useLibrary } from "@/lib/use-library";
import { toggleSaved, useSavedKeys } from "@/lib/use-saved";
import type { FeedItem } from "@/lib/types";
import FeedCard from "./FeedCard";

export default function StoryDrawer({ items, onClose }: { items: FeedItem[]; onClose: () => void }) {
  const dialog = useDialog(true);
  const { prefs, setPrefs } = usePrefs();
  const library = useLibrary();
  const saved = useSavedKeys();
  const first = items[0];
  const meta = first.curation ?? classify(first);
  const id = stableStoryId(first);
  const record = library.records.find((r) => r.storyId === id);
  const reporting = new Set(items.map(reportingPublisher).filter(Boolean));
  const platforms = new Set(items.map(discussionPlatform).filter(Boolean));
  const dedupLinks = (list: FeedItem[]) => [...new Map(list.map((it) => [canonicalUrl(it.externalUrl ?? it.url), it])).values()];
  const primary = dedupLinks(items.filter(isPrimarySource));
  const articles = dedupLinks(items.filter((it) => !isPrimarySource(it) && reportingPublisher(it)));
  const discussions = items.filter((it) => discussionPlatform(it));
  return <dialog ref={dialog} aria-labelledby="story-heading" onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} className="reader-dialog">
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 p-5 dark:border-zinc-800">
        <div><p className="reader-eyebrow">Story desk</p><h2 id="story-heading" className="mt-1 text-xl font-semibold">Sources & discussion</h2></div>
        <button onClick={onClose} aria-label="Close story" className="action-button">✕</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-3 border-b border-zinc-200 p-5 dark:border-zinc-800">
          <h3 className="text-lg font-semibold leading-snug">{first.title}</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{reporting.size} reporting {reporting.size === 1 ? "publisher" : "publishers"} · {platforms.size} discussion {platforms.size === 1 ? "platform" : "platforms"}</p>
          <div className="flex flex-wrap gap-2">
            <button className="action-button" onClick={() => markRead(items, !record?.readAt)}>{record?.readAt ? "Mark unread" : "Mark read"}</button>
            <button className="action-button" onClick={() => toggleSaved(first)} aria-pressed={saved.has(id)}>{saved.has(id) ? "Saved" : "Save"}</button>
            <button className="action-button" onClick={() => toggleFollowStory(first)} aria-pressed={Boolean(record?.followedAt)}>{record?.followedAt ? "Following story" : "Follow story"}</button>
            <button className="action-button" onClick={() => { items.forEach((item) => setDismissed(item, true)); onClose(); }}>Dismiss</button>
          </div>
          <div className="flex flex-wrap gap-2">{meta.topics.map((topic) => <button key={topic} aria-pressed={prefs.followedTopics.includes(topic)} className="action-button" onClick={() => setPrefs((p) => ({ ...p, followedTopics: p.followedTopics.includes(topic) ? p.followedTopics.filter((t) => t !== topic) : [...p.followedTopics, topic] }))}>{prefs.followedTopics.includes(topic) ? "Following" : "Follow"} {CATEGORIES[topic].label}</button>)}</div>
          <details className="text-xs text-zinc-600 dark:text-zinc-300"><summary className="cursor-pointer py-3">Why shown?</summary><p>{meta.kind} · {meta.reasons.join(". ")}</p><p className="mt-2">Rule-based labels from feed text. Reporting counts distinguish domains, not independent verification of a claim. Reposting the same link adds discussion, not another publisher.</p></details>
          <details className="text-xs"><summary className="cursor-pointer py-3">Source preferences</summary><div className="flex flex-wrap gap-2">
            {first.author && <button className="action-button" onClick={() => setPrefs((p) => ({ ...p, mutedAuthors: p.mutedAuthors.includes(authorKey(first)) ? p.mutedAuthors.filter((k) => k !== authorKey(first)) : [...p.mutedAuthors, authorKey(first)].slice(-200) }))}>{prefs.mutedAuthors.includes(authorKey(first)) ? "Unmute" : "Mute"} {first.author}</button>}
            <button className="action-button" onClick={() => setPrefs((p) => ({ ...p, mutedOutlets: p.mutedOutlets.includes(outletKey(first)) ? p.mutedOutlets.filter((k) => k !== outletKey(first)) : [...p.mutedOutlets, outletKey(first)].slice(-200) }))}>{prefs.mutedOutlets.includes(outletKey(first)) ? "Unmute" : "Mute"} {outletKey(first)}</button>
          </div></details>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Excerpts belong to their sources. Open a headline for the original. Personal notes and read state stay in this browser.</p>
        </div>
        {[{ label: "Original announcements & research", list: primary }, { label: "Reporting", list: articles }, { label: "Discussions & video", list: discussions }].filter((section) => section.list.length).map((section) => <section key={section.label}>
          <h3 className="border-b border-zinc-200 bg-zinc-50 px-5 py-3 text-sm font-semibold dark:border-zinc-800 dark:bg-zinc-900">{section.label}</h3>
          {section.list.map((item) => <FeedCard key={item.source + ":" + item.id} item={item} related={items} showSource preview={false} />)}
        </section>)}
        {!primary.length && !articles.length && !discussions.length && <FeedCard item={first} related={items} showSource preview={false} />}
      </div>
    </div>
  </dialog>;
}
