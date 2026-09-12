"use client";

import { useState } from "react";
import { CATEGORIES } from "@/lib/categories";
import { FOLLOWABLE_TOPICS } from "@/lib/curation";
import { usePrefs } from "@/lib/use-prefs";
import { useLibrary, setFollowedTerms } from "@/lib/use-library";

export default function CurationControls() {
  const { prefs, setPrefs } = usePrefs();
  const { followedTerms } = useLibrary();
  const [company, setCompany] = useState("");
  const muted = prefs.mutedAuthors.length + prefs.mutedOutlets.length;
  return <section aria-label="Reading preferences" className="space-y-4 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-2 font-medium">Feed scope</span>
      {(["broad", "builder"] as const).map((mode) => <button key={mode} className="action-button" aria-pressed={prefs.contentMode === mode} onClick={() => setPrefs((p) => ({ ...p, contentMode: mode }))}>{mode === "builder" ? "Builder" : "Broad"}</button>)}
      <p className="text-zinc-600 dark:text-zinc-400">Broad includes business, policy, research, and safety—not just tools.</p>
    </div>
    <div>
      <p className="mb-2 font-medium">Follow topics</p>
      <div className="flex flex-wrap gap-1">{FOLLOWABLE_TOPICS.map((topic) => <button key={topic} className="action-button" aria-pressed={prefs.followedTopics.includes(topic)} onClick={() => setPrefs((p) => ({ ...p, followedTopics: p.followedTopics.includes(topic) ? p.followedTopics.filter((t) => t !== topic) : [...p.followedTopics, topic] }))}>{CATEGORIES[topic].label}</button>)}</div>
    </div>
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); const term = company.trim(); if (term) { setFollowedTerms([...followedTerms, term]); setCompany(""); } }}>
      <input aria-label="Follow a company or product" placeholder="Company or product" className="reader-input min-w-0 flex-1" maxLength={80} value={company} onChange={(e) => setCompany(e.target.value)} />
      <button className="action-button">Follow</button>
      {followedTerms.map((term) => <button type="button" className="action-button max-w-full break-all whitespace-normal text-left" key={term} onClick={() => setFollowedTerms(followedTerms.filter((t) => t !== term))} aria-label={"Unfollow " + term}>{term} ×</button>)}
    </form>
    <p className="text-xs text-zinc-600 dark:text-zinc-400">Your interests get their own section. They do not crowd out the essential Brief. Preferences stay in this browser; custom feeds keep their explicit scope.</p>
    {muted > 0 && <button className="action-button" onClick={() => setPrefs((p) => ({ ...p, mutedAuthors: [], mutedOutlets: [] }))}>Restore {muted} muted authors / outlets</button>}
  </section>;
}
