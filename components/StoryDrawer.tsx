"use client";

import { classify, authorKey, outletKey } from "@/lib/curation";
import { CATEGORIES } from "@/lib/categories";
import { publisher } from "@/lib/stories";
import { useDialog } from "@/lib/use-dialog";
import { usePrefs } from "@/lib/use-prefs";
import type { FeedItem } from "@/lib/types";
import FeedCard from "./FeedCard";

export default function StoryDrawer({ items, onClose }: { items: FeedItem[]; onClose: () => void }) {
  const dialog = useDialog(true);
  const { prefs, setPrefs } = usePrefs();
  const first = items[0];
  const meta = first.curation ?? classify(first);
  return <dialog ref={dialog} aria-labelledby="story-heading" onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} className="reader-dialog">
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-black/10 p-4 dark:border-white/10">
        <div><p className="text-xs uppercase tracking-widest text-cyan-700 dark:text-cyan-300">Story desk</p><h2 id="story-heading" className="mt-1 text-lg font-semibold">{items.length > 1 ? "Coverage & discussion" : "Read & follow"}</h2></div>
        <button onClick={onClose} aria-label="Close story" className="action-button">✕</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-3 border-b border-black/10 p-4 dark:border-white/10">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{items.length} {items.length === 1 ? "item" : "items"} · {new Set(items.map(publisher)).size} publishers / platforms</p>
          <div className="flex flex-wrap gap-2">{meta.topics.map((topic) => <button key={topic} aria-pressed={prefs.followedTopics.includes(topic)} className="action-button" onClick={() => setPrefs((p) => ({ ...p, followedTopics: p.followedTopics.includes(topic) ? p.followedTopics.filter((t) => t !== topic) : [...p.followedTopics, topic] }))}>{prefs.followedTopics.includes(topic) ? "Following" : "Follow"} {CATEGORIES[topic].label}</button>)}</div>
          <details className="text-xs text-zinc-600 dark:text-zinc-300"><summary className="cursor-pointer py-2">Why shown?</summary><p>{meta.kind} · {meta.reasons.join(". ")}</p><p className="mt-2">Rule-based labels from feed text. Coverage counts do not verify a claim.</p></details>
          <div className="flex flex-wrap gap-2">
            {first.author && <button className="action-button" onClick={() => setPrefs((p) => ({ ...p, mutedAuthors: p.mutedAuthors.includes(authorKey(first)) ? p.mutedAuthors.filter((k) => k !== authorKey(first)) : [...p.mutedAuthors, authorKey(first)].slice(-200) }))}>{prefs.mutedAuthors.includes(authorKey(first)) ? "Unmute" : "Mute"} {first.author}</button>}
            <button className="action-button" onClick={() => setPrefs((p) => ({ ...p, mutedOutlets: p.mutedOutlets.includes(outletKey(first)) ? p.mutedOutlets.filter((k) => k !== outletKey(first)) : [...p.mutedOutlets, outletKey(first)].slice(-200) }))}>{prefs.mutedOutlets.includes(outletKey(first)) ? "Unmute" : "Mute"} {outletKey(first)}</button>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Excerpts provided by each feed. Open a headline for the original. Preferences stay in this browser.</p>
        </div>
        {items.map((item) => <FeedCard key={`${item.source}:${item.id}`} item={item} showSource preview={false} />)}
      </div>
    </div>
  </dialog>;
}
