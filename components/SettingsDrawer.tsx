"use client";

import { useDialog } from "@/lib/use-dialog";
import { BUILT_IN_FEEDS, deckKnownIds, effectiveOrder, isPanelId, PANEL_LABELS } from "@/lib/feeds";
import { clearSeen, useSeenCount } from "@/lib/use-seen";
import { REFRESH_OPTIONS } from "@/lib/refresh";
import { SORT_OPTIONS } from "@/lib/sort";
import type { Prefs } from "@/lib/types";
import { ChevronDownIcon, ChevronUpIcon, GearIcon, PlusIcon, TrophyIcon, XBrandIcon, XIcon } from "./icons";
import SourceIcon from "./SourceIcon";
import CurationControls from "./CurationControls";
import ThemeToggle from "./ThemeToggle";

export default function SettingsDrawer({ open, onClose, prefs, setPrefs, onAddFeed, onRefresh, onOpenHelp }: {
  open: boolean; onClose: () => void; prefs: Prefs;
  setPrefs: (update: (prefs: Prefs) => Prefs) => void;
  onAddFeed: () => void; onRefresh: () => void; onOpenHelp: () => void;
}) {
  const ref = useDialog(open);
  const seenCount = useSeenCount();
  const orderedIds = effectiveOrder(prefs.order, deckKnownIds(prefs.custom));
  const rows = orderedIds.map((id) => {
    const feed = BUILT_IN_FEEDS.find((feed) => feed.id === id) ?? prefs.custom.find((feed) => feed.id === id);
    return { id, label: isPanelId(id) ? PANEL_LABELS[id] : feed?.label ?? id, source: feed?.source, isCustom: prefs.custom.some((feed) => feed.id === id) };
  });
  const move = (id: string, delta: -1 | 1) => setPrefs((p) => {
    const order = effectiveOrder(p.order, deckKnownIds(p.custom));
    const index = order.indexOf(id), target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) return p;
    [order[index], order[target]] = [order[target], order[index]];
    return { ...p, order };
  });

  return <dialog ref={ref} className="reader-dialog settings-drawer" aria-labelledby="settings-title" onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-teal-50 p-3 text-teal-700 dark:bg-teal-950 dark:text-teal-300"><GearIcon className="h-5 w-5" /></span><div><h2 id="settings-title" className="text-xl font-semibold">Settings</h2><p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">Make Signal work for you</p></div></div>
        <button onClick={onClose} aria-label="Close settings" className="reader-icon flex items-center justify-center"><XIcon className="h-5 w-5" /></button>
      </header>
      <div className="feed-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
        <section className="settings-section" aria-labelledby="appearance-title">
          <h3 id="appearance-title">Appearance</h3>
          <div className="settings-row"><div><p className="font-medium">Color theme</p><p className="settings-hint">Switch between light and dark</p></div><ThemeToggle /></div>
          <fieldset><legend className="mb-2 text-sm font-medium">Text size</legend><div className="settings-segments">
            {([{ id: "sm", label: "Small" }, { id: "md", label: "Medium" }, { id: "lg", label: "Large" }, { id: "xl", label: "Largest" }] as const).map((size) => <button key={size.id} aria-pressed={prefs.textScale === size.id} onClick={() => setPrefs((p) => ({ ...p, textScale: size.id }))}>{size.label}</button>)}
          </div></fieldset>
          <fieldset><legend className="mb-2 text-sm font-medium">Deck density</legend><div className="settings-segments">
            {(["comfortable", "compact"] as const).map((density) => <button key={density} aria-pressed={prefs.density === density} onClick={() => setPrefs((p) => ({ ...p, density }))}>{density === "comfortable" ? "Comfortable" : "Compact"}</button>)}
          </div><p className="settings-hint mt-2">Compact hides excerpts in the Deck.</p></fieldset>
        </section>

        <section className="settings-section" aria-labelledby="feeds-title">
          <div><h3 id="feeds-title">Sources & refresh</h3><p className="settings-hint mt-1">Choose your Deck columns. AI on X visibility also applies to the homepage.</p></div>
          <label className="settings-row"><span className="font-medium">Auto-refresh</span><select className="reader-input" value={prefs.refreshMs} onChange={(e) => setPrefs((p) => ({ ...p, refreshMs: Number(e.target.value) }))}>{REFRESH_OPTIONS.map((option) => <option key={option.ms} value={option.ms}>{option.ms ? `Every ${option.label}` : "Off"}</option>)}</select></label>
          <p className="settings-hint">Refresh pauses while this tab is in the background. X embeds follow X’s own refresh behavior.</p>
          <label className="settings-row"><span className="font-medium">Deck sorting</span><select className="reader-input" value={prefs.sortMode} onChange={(e) => setPrefs((p) => ({ ...p, sortMode: e.target.value as Prefs["sortMode"] }))}>{SORT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          <button className="action-button w-full" onClick={onRefresh}>Refresh feeds now</button>
          <details className="settings-sources" open><summary className="cursor-pointer py-3 text-sm font-medium">Manage sources <span className="font-normal text-zinc-500">· {rows.filter((row) => !prefs.hidden.includes(row.id)).length} shown</span></summary>
            <p className="settings-hint mb-3">Arrows change the Deck order from left to right. Bluesky is off by default because of recurring connection errors.</p>
            <ul className="space-y-1">{rows.map((row, index) => <li key={row.id} className="settings-source-row">
              {row.source ? <SourceIcon source={row.source} /> : row.id === "x-discovery" ? <XBrandIcon className="h-4 w-4" /> : <TrophyIcon className="h-4 w-4 text-amber-500" />}
              <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 text-sm"><span className="truncate" title={row.label}>{row.label}</span><input className="h-4 w-4 shrink-0 accent-teal-700" type="checkbox" aria-label={`Show ${row.label}`} checked={!prefs.hidden.includes(row.id)} onChange={() => setPrefs((p) => ({ ...p, hidden: p.hidden.includes(row.id) ? p.hidden.filter((id) => id !== row.id) : [...p.hidden, row.id] }))} /></label>
              <button className="settings-small-button" disabled={index === 0} aria-label={`Move ${row.label} left`} title="Move earlier in Deck" onClick={() => move(row.id, -1)}><ChevronUpIcon /></button>
              <button className="settings-small-button" disabled={index === rows.length - 1} aria-label={`Move ${row.label} right`} title="Move later in Deck" onClick={() => move(row.id, 1)}><ChevronDownIcon /></button>
              {row.isCustom && <button className="settings-small-button text-red-600" aria-label={`Remove ${row.label}`} onClick={() => setPrefs((p) => ({ ...p, custom: p.custom.filter((feed) => feed.id !== row.id), hidden: p.hidden.filter((id) => id !== row.id), order: p.order.filter((id) => id !== row.id) }))}><XIcon /></button>}
            </li>)}</ul>
            <button onClick={onAddFeed} className="action-button mt-3 w-full"><PlusIcon /> Add feed</button>
          </details>
        </section>

        <section className="settings-section" aria-labelledby="interests-title"><h3 id="interests-title">Interests & filters</h3><CurationControls /></section>
        <section className="settings-section" aria-labelledby="history-title"><h3 id="history-title">Reading & shortcuts</h3>
          <p className="settings-hint">Stories are marked read when you open their headline or choose Mark read. Scrolling past a story leaves it unread. Your library stays in this browser.</p>
          <button className="action-button w-full" onClick={clearSeen} disabled={seenCount === 0}>Mark {seenCount} read stories unread</button>
          <button className="action-button w-full" onClick={onOpenHelp}>Keyboard shortcuts</button>
        </section>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900"><span className="text-xs text-zinc-600 dark:text-zinc-400">Changes apply immediately</span><button className="action-button reader-primary px-5" onClick={onClose}>Done</button></footer>
    </div>
  </dialog>;
}
