"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { SOURCE_LABELS } from "@/lib/feeds";
import { CATEGORIES } from "@/lib/categories";
import {
  exportLibrary, importLibrary, markRead, MAX_IMPORT_BYTES, removeLibrarySearch,
  saveLibrarySearch, searchLibrary, setDismissed, setFollowedTerms, toggleFollowStory,
  toggleLibrarySaved, updateLibraryItem, useArchiveItems, useLibrary,
  type LibraryFilters, type LibraryRecord,
} from "@/lib/use-library";
import type { FeedItem, SourceId } from "@/lib/types";

const EMPTY_ITEMS: FeedItem[] = [];
const CONTROL = "min-h-11 rounded-lg border border-zinc-300 bg-transparent px-3 text-sm text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 dark:border-zinc-700 dark:text-zinc-200";
const ACTION = "min-h-11 rounded-lg px-3 text-sm text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-cyan-600 dark:text-zinc-300 dark:hover:bg-zinc-800";

function NotesEditor({ record }: { record: LibraryRecord }) {
  // Null means untouched: remote saved changes remain visible, while a local
  // unsaved draft survives incoming coverage or cross-tab updates.
  const [note, setNote] = useState<string | null>(null);
  const [collection, setCollection] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <details className="mt-2 rounded-lg border border-zinc-200 px-3 dark:border-zinc-800">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm text-zinc-600 dark:text-zinc-300">{record.collection ? `Collection: ${record.collection}` : "Collection & personal note"}{record.note ? " · Has note" : ""}</summary>
      <form className="grid gap-3 pb-3" onSubmit={(event) => { event.preventDefault(); updateLibraryItem(record.storyId, { ...(note !== null ? { note } : {}), ...(collection !== null ? { collection } : {}) }); setNote(null); setCollection(null); setSaved(true); }}>
        <label className="grid gap-1 text-sm">Collection<input className={CONTROL} value={collection ?? record.collection} maxLength={100} onChange={(event) => { setCollection(event.target.value); setSaved(false); }} placeholder="e.g. Work ideas" /></label>
        <label className="grid gap-1 text-sm">Personal note<textarea aria-label="Personal note" className={`${CONTROL} min-h-24 py-2`} value={note ?? record.note} maxLength={10000} onChange={(event) => { setNote(event.target.value); setSaved(false); }} placeholder="What you want to remember" /></label>
        <div><button type="submit" className={CONTROL}>Save note & collection</button>{saved && <span className="ml-3 text-sm" role="status">Updated</span>}</div>
      </form>
    </details>
  );
}

export default function LibraryView({ query, onQueryChange, items = EMPTY_ITEMS }: { query: string; onQueryChange: (query: string) => void; items?: readonly FeedItem[] }) {
  useArchiveItems(items);
  const library = useLibrary();
  const [filters, setFilters] = useState<LibraryFilters>({});
  const [limit, setLimit] = useState(40);
  const [searchName, setSearchName] = useState("");
  const [followTerm, setFollowTerm] = useState("");
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query);
  const activeFilters = useMemo(() => ({ ...filters, query: deferredQuery }), [filters, deferredQuery]);
  const matching = useMemo(() => searchLibrary(library.records, activeFilters), [library.records, activeFilters]);
  const collections = useMemo(() => [...new Set(library.records.map((record) => record.collection).filter(Boolean))].sort(), [library.records]);
  const updateFilter = (patch: Partial<LibraryFilters>) => { setFilters((current) => ({ ...current, ...patch })); setLimit(40); };
  const download = () => {
    const blob = new Blob([exportLibrary()], { type: "application/json" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = `signal-library-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Backup downloaded. Keep it somewhere safe; this library lives only in this browser.");
  };
  const importFile = async (file: File) => {
    setImporting(true); setMessage("");
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error("Backup is too large. Maximum file size is 25 MB.");
      const count = await importLibrary(await file.text());
      setMessage(`Merged ${count} stories. Existing notes and saved items were preserved. Check the storage notice below before closing this tab.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The backup could not be imported."); }
    finally { setImporting(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  return (
    <section aria-label="Research library" className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-semibold tracking-tight">Your research library</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">Search your collection—not the whole web. Recent stories stay for 30 days (up to 5,000); saved stories and personal notes stay until you remove them. No account or cross-device sync.</p></div>
        <div className="flex gap-2"><button className={CONTROL} onClick={download} disabled={!library.ready}>Export backup</button><button className={CONTROL} onClick={() => inputRef.current?.click()} disabled={!library.ready || importing}>{importing ? "Importing…" : "Import backup"}</button><input ref={inputRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Choose Signal backup" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} /></div>
      </div>
      {library.storageWarning && <p role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">{library.storageWarning}</p>}
      {message && <p role="status" className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">{message}</p>}
      <label className="mt-6 grid gap-2 text-sm font-medium">Search your collection<input type="search" className={`${CONTROL} w-full`} value={query} placeholder="Company, topic, author, title, or your notes…" onChange={(event) => { onQueryChange(event.target.value); setLimit(40); }} /></label>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="grid gap-1 text-xs text-zinc-600 dark:text-zinc-400">Source<select className={CONTROL} value={filters.source ?? ""} onChange={(event) => updateFilter({ source: event.target.value })}><option value="">All sources</option>{Object.entries(SOURCE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className="grid gap-1 text-xs text-zinc-600 dark:text-zinc-400">Topic<select className={CONTROL} value={filters.topic ?? ""} onChange={(event) => updateFilter({ topic: event.target.value })}><option value="">All topics</option>{Object.entries(CATEGORIES).filter(([id]) => id !== "trending").map(([id, category]) => <option key={id} value={id}>{category.label}</option>)}</select></label>
        <label className="grid gap-1 text-xs text-zinc-600 dark:text-zinc-400">Content type<select className={CONTROL} value={filters.kind ?? ""} onChange={(event) => updateFilter({ kind: event.target.value })}><option value="">All types</option>{["News", "Release", "Tool", "Tutorial", "Research", "Security", "Discussion", "Commentary"].map((kind) => <option key={kind}>{kind}</option>)}</select></label>
        <label className="grid gap-1 text-xs text-zinc-600 dark:text-zinc-400">Published since<input type="date" className={`${CONTROL} min-w-0`} value={filters.after ?? ""} onChange={(event) => updateFilter({ after: event.target.value })} /></label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4">
        {([['saved', 'Saved'], ['unread', 'Unread'], ['followed', 'Following'], ['includeDismissed', 'Include dismissed']] as const).map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={!!filters[key]} onChange={(event) => updateFilter({ [key]: event.target.checked })} />{label}</label>)}
        {collections.length > 0 && <select aria-label="Collection" className={CONTROL} value={filters.collection ?? ""} onChange={(event) => updateFilter({ collection: event.target.value })}><option value="">All collections</option>{collections.map((collection) => <option key={collection}>{collection}</option>)}</select>}
        <button className={ACTION} onClick={() => { setFilters({}); onQueryChange(""); setLimit(40); }}>Clear filters</button>
      </div>
      <details className="mt-2 rounded-xl border border-zinc-200 px-4 dark:border-zinc-800">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Saved searches & followed companies/topics</summary>
        <form className="mb-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); saveLibrarySearch(searchName || query || "My search", { ...filters, query }); setSearchName(""); }}><input className={`${CONTROL} min-w-0 flex-1`} aria-label="Name this search" value={searchName} maxLength={100} onChange={(event) => setSearchName(event.target.value)} placeholder="Name this search" /><button className={CONTROL} type="submit">Save current search</button></form>
        <ul className="mb-3">{library.savedSearches.map((search) => <li key={search.id} className="flex items-center justify-between gap-2"><button className={`${ACTION} text-left`} onClick={() => { setFilters(search.filters); onQueryChange(search.filters.query ?? ""); setLimit(40); }}>{search.name}</button><button className={ACTION} aria-label={`Remove saved search ${search.name}`} onClick={() => removeLibrarySearch(search.id)}>Remove</button></li>)}</ul>
        <form className="mb-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setFollowedTerms([...library.followedTerms, followTerm]); setFollowTerm(""); }}><input className={`${CONTROL} min-w-0 flex-1`} aria-label="Company or topic to follow" value={followTerm} maxLength={100} onChange={(event) => setFollowTerm(event.target.value)} placeholder="Follow a company or topic, e.g. Anthropic" /><button className={CONTROL} type="submit">Follow</button></form>
        <p className="mb-2 text-xs text-zinc-600 dark:text-zinc-400">Follows add a separate interest section to Brief; they never narrow your essential news.</p>
        <div className="mb-3 flex flex-wrap gap-2">{library.followedTerms.map((term) => <button key={term} className={CONTROL} onClick={() => setFollowedTerms(library.followedTerms.filter((entry) => entry !== term))} aria-label={`Unfollow ${term}`}>{term} ×</button>)}</div>
      </details>
      <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400" role="status">{library.ready ? `${matching.length} matching ${matching.length === 1 ? "story" : "stories"} · ${library.records.length} in this browser` : "Opening your local library…"}</p>
      <div className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
        {matching.slice(0, limit).map((record) => <article key={record.storyId} className="py-5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400"><span>{record.item.sourceMeta || SOURCE_LABELS[record.item.source as SourceId]}</span><span>·</span><time dateTime={record.item.timestamp}>{new Date(record.item.timestamp).toLocaleDateString()}</time>{record.item.author && <span>· {record.item.author}</span>}{record.item.curation?.kind && <span>· {record.item.curation.kind}</span>}{record.readAt && <span>· Read</span>}{record.dismissedAt && <span>· Dismissed</span>}</div>
          <h2 className="mt-2 text-lg font-semibold leading-snug"><a href={record.item.externalUrl ?? record.item.url} target="_blank" rel="noopener noreferrer" className="hover:underline focus-visible:outline-2 focus-visible:outline-cyan-600">{record.item.title}</a></h2>
          {record.item.excerpt && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{record.item.excerpt}</p>}
          <div className="mt-2 flex flex-wrap gap-1"><button className={ACTION} aria-pressed={!!record.readAt} onClick={() => markRead(record.item, !record.readAt)}>{record.readAt ? "Mark unread" : "Mark read"}</button><button className={ACTION} aria-pressed={!!record.savedAt} onClick={() => toggleLibrarySaved(record.item)}>{record.savedAt ? "Unsave" : "Save"}</button><button className={ACTION} aria-pressed={!!record.followedAt} onClick={() => toggleFollowStory(record.item)}>{record.followedAt ? "Unfollow story" : "Follow story"}</button><button className={ACTION} onClick={() => setDismissed(record.item, !record.dismissedAt)}>{record.dismissedAt ? "Restore" : "Dismiss"}</button></div>
          <NotesEditor key={record.storyId} record={record} />
        </article>)}
      </div>
      {library.ready && matching.length === 0 && <p className="py-12 text-center text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">No matching stories yet. Try fewer filters, browse Brief or Deck to collect stories, or import a previous backup.</p>}
      {matching.length > limit && <button className={`${CONTROL} mx-auto my-5 block`} onClick={() => setLimit((value) => value + 40)}>Show 40 more</button>}
    </section>
  );
}
