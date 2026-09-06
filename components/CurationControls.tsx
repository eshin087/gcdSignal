"use client";

import { useState } from "react";
import { CATEGORIES } from "@/lib/categories";
import { FOLLOWABLE_TOPICS } from "@/lib/curation";
import { usePrefs } from "@/lib/use-prefs";

export default function CurationControls() {
  const { prefs, setPrefs } = usePrefs();
  const [open, setOpen] = useState(false);
  const muted = prefs.mutedAuthors.length + prefs.mutedOutlets.length;
  return <div className="shrink-0 border-b border-black/10 px-3 py-1 dark:border-white/10">
    <div className="flex items-center gap-2 text-xs">
      <div className="flex gap-1" role="group" aria-label="Feed scope">
        {(["builder", "broad"] as const).map((mode) => <button key={mode} className="action-button" aria-pressed={prefs.contentMode === mode} onClick={() => setPrefs((p) => ({ ...p, contentMode: mode }))}>{mode === "builder" ? "Builder" : "Broad"}</button>)}
      </div>
      <span className="hidden text-zinc-600 sm:inline dark:text-zinc-400">{prefs.contentMode === "builder" ? "Tools, releases, research & technical discussion" : "Including broader AI conversation"}</span>
      <button className="action-button ml-auto" aria-expanded={open} onClick={() => setOpen(!open)}>Interests{prefs.followedTopics.length ? ` (${prefs.followedTopics.length})` : ""}</button>
    </div>
    {open && <div className="space-y-2 py-2 text-xs text-zinc-600 dark:text-zinc-400">
      <p>Follow topics to boost them in Signal sort. Preferences stay in this browser. Custom feeds keep their own scope.</p>
      <div className="flex flex-wrap gap-1">{FOLLOWABLE_TOPICS.map((topic) => <button key={topic} className="action-button" aria-pressed={prefs.followedTopics.includes(topic)} onClick={() => setPrefs((p) => ({ ...p, followedTopics: p.followedTopics.includes(topic) ? p.followedTopics.filter((t) => t !== topic) : [...p.followedTopics, topic] }))}>{CATEGORIES[topic].label}</button>)}</div>
      {muted > 0 && <button className="action-button" onClick={() => setPrefs((p) => ({ ...p, mutedAuthors: [], mutedOutlets: [] }))}>Restore {muted} muted authors / outlets</button>}
      <p>Signal combines freshness, engagement relative to each platform, builder relevance and followed topics, with source diversity. It does not measure engagement velocity.</p>
    </div>}
  </div>;
}
