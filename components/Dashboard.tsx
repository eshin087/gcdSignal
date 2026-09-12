"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, CATEGORY_IDS } from "@/lib/categories";
import {
  BUILT_IN_FEEDS,
  deckKnownIds,
  effectiveOrder,
  isPanelId,
  PANEL_LABELS,
} from "@/lib/feeds";
import { SORT_OPTIONS } from "@/lib/sort";
import { useHotkeys } from "@/lib/use-hotkeys";
import { usePrefs } from "@/lib/use-prefs";
import { clearSeen } from "@/lib/use-seen";
import type { CategoryId, DeckItem, Density, TextScale, VisibleFeed } from "@/lib/types";
import dynamic from "next/dynamic";
import ReadingProvider from "./ReadingContext";
import { useLibrary } from "@/lib/use-library";
import BriefView from "./BriefView";
const ResearchScreen = dynamic(() => import("./ResearchScreen"));
const XReadingPanel = dynamic(() => import("./XReadingPanel"));
const AddFeedDialog = dynamic(() => import("./AddFeedDialog"));
import ColumnDeck from "./ColumnDeck";
import type { Command } from "./CommandPalette";
const CommandPalette = dynamic(() => import("./CommandPalette"));
import Header from "./Header";
const SettingsDrawer = dynamic(() => import("./SettingsDrawer"));
const ShortcutsOverlay = dynamic(() => import("./ShortcutsOverlay"));
import StatusBar from "./StatusBar";
import { toggleTheme } from "./ThemeToggle";

const TEXT_SIZES: Array<{ id: TextScale; label: string }> = [
  { id: "sm", label: "Small" },
  { id: "md", label: "Medium" },
  { id: "lg", label: "Large" },
  { id: "xl", label: "Extra large" },
];
const DENSITIES: Array<{ id: Density; label: string }> = [
  { id: "comfortable", label: "Comfortable" },
  { id: "compact", label: "Compact" },
];

export default function Dashboard() {
  const { prefs, setPrefs, ready } = usePrefs();
  const [refresh, setRefresh] = useState(() => ({ key: 0, at: Date.now() }));
  const lastRefreshRef = useRef(refresh.at);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addFeedOpen, setAddFeedOpen] = useState(false);
  const library = useLibrary();
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Session-only search query, debounced so columns don't filter per keystroke.
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQuery(queryInput.trim()), 150);
    return () => clearTimeout(id);
  }, [queryInput]);

  // Text-size attribute lives on <html> (pre-paint script sets the initial one).
  const textScale = prefs.textScale;
  useEffect(() => {
    if (textScale === "md") document.documentElement.removeAttribute("data-text");
    else document.documentElement.setAttribute("data-text", textScale);
  }, [textScale]);

  const bumpRefresh = useCallback(() => {
    const now = Date.now();
    lastRefreshRef.current = now;
    setRefresh((r) => ({ key: r.key + 1, at: now }));
  }, []);

  // Centralized auto-refresh at the user's chosen cadence: bump refreshKey so
  // every column refetches (cheap — the server caches each feed ~5 min anyway).
  const refreshMs = prefs.refreshMs;
  useEffect(() => {
    if (refreshMs === 0) return;
    const id = setInterval(() => {
      if (!document.hidden) bumpRefresh();
    }, refreshMs);
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastRefreshRef.current > refreshMs) {
        bumpRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [bumpRefresh, refreshMs]);

  const setCategory = (category: CategoryId) => setPrefs((p) => ({ ...p, category }));

  // Deck slots resolved through the user's stored order (hidden ids filtered
  // at the end so toggling visibility never loses a column's position).
  const feedById = new Map<string, VisibleFeed>();
  for (const f of BUILT_IN_FEEDS) {
    feedById.set(f.id, { id: f.id, source: f.source, label: f.label, isCustom: false });
  }
  for (const c of prefs.custom) {
    feedById.set(c.id, { id: c.id, source: c.source, label: c.label, params: c.params, isCustom: true });
  }
  const orderedIds = effectiveOrder(prefs.order, deckKnownIds(prefs.custom));
  const labelOf = (id: string) =>
    isPanelId(id) ? PANEL_LABELS[id] : (feedById.get(id)?.label ?? id);
  const deckItems: DeckItem[] = [];
  for (const id of orderedIds) {
    if (prefs.hidden.includes(id)) continue;
    if (isPanelId(id)) {
      deckItems.push({ kind: "panel", id, label: PANEL_LABELS[id] });
    } else {
      const feed = feedById.get(id);
      if (feed) deckItems.push({ kind: "feed", id, feed });
    }
  }
  const visibleFeeds = deckItems.flatMap((it) => (it.kind === "feed" ? [it.feed] : []));

  const handleReorder = (dragId: string, targetId: string, side: "before" | "after") =>
    setPrefs((p) => {
      const ids = effectiveOrder(p.order, deckKnownIds(p.custom)).filter((id) => id !== dragId);
      const idx = ids.indexOf(targetId);
      if (idx === -1) return p;
      ids.splice(side === "before" ? idx : idx + 1, 0, dragId);
      return { ...p, order: ids };
    });

  // Keyboard: j/k/h/l/o/s/r/? + Ctrl+K. Handlers are stable so the listener
  // isn't re-bound every render.
  const hotkeyHandlers = useMemo(
    () => ({
      onPalette: () => setPaletteOpen((o) => !o),
      onHelp: () => setHelpOpen((o) => !o),
      onEscape: () => {
        setHelpOpen(false);
        setPaletteOpen(false);
      },
    }),
    []
  );
  useHotkeys(hotkeyHandlers);

  // Command palette — built from the current state each render (cheap).
  const commands: Command[] = [
    ...CATEGORY_IDS.map((id) => ({
      id: `cat:${id}`,
      group: "category",
      label: CATEGORIES[id].label,
      hint: prefs.category === id ? "current" : undefined,
      run: () => setCategory(id),
    })),
    {
      id: "view:deck",
      group: "view",
      label: "Deck view",
      hint: prefs.view === "deck" ? "current" : undefined,
      run: () => setPrefs((p) => ({ ...p, view: "deck" })),
    },
    {
      id: "view:brief",
      group: "view",
      label: "Essential Brief",
      hint: prefs.view === "brief" ? "current" : undefined,
      run: () => setPrefs((p) => ({ ...p, view: "brief" })),
    },
    ...orderedIds.map((id) => {
      const hidden = prefs.hidden.includes(id);
      return {
        id: `col:${id}`,
        group: "columns",
        label: `${hidden ? "Show" : "Hide"} ${labelOf(id)}`,
        run: () =>
          setPrefs((p) => ({
            ...p,
            hidden: hidden ? p.hidden.filter((x) => x !== id) : [...p.hidden, id],
          })),
      };
    }),
    ...SORT_OPTIONS.map((o) => ({
      id: `sort:${o.id}`,
      group: "sort",
      label: `Sort by ${o.label.toLowerCase()}`,
      hint: prefs.sortMode === o.id ? "current" : undefined,
      run: () => setPrefs((p) => ({ ...p, sortMode: o.id })),
    })),
    ...TEXT_SIZES.map((t) => ({
      id: `text:${t.id}`,
      group: "display",
      label: `Text size: ${t.label}`,
      hint: prefs.textScale === t.id ? "current" : undefined,
      run: () => setPrefs((p) => ({ ...p, textScale: t.id })),
    })),
    ...DENSITIES.map((d) => ({
      id: `density:${d.id}`,
      group: "display",
      label: `Density: ${d.label}`,
      hint: prefs.density === d.id ? "current" : undefined,
      run: () => setPrefs((p) => ({ ...p, density: d.id })),
    })),
    { id: "theme", group: "display", label: "Toggle light / dark theme", run: toggleTheme },
    { id: "refresh", group: "feeds", label: "Refresh all feeds", hint: "r = one column", run: bumpRefresh },
    { id: "open:saved", group: "open", label: "Search your collection / saved items", run: () => setPrefs((p) => ({ ...p, view: "library" })) },
    { id: "open:settings", group: "open", label: "Settings", run: () => setSettingsOpen(true) },
    { id: "open:add", group: "open", label: "Add a feed", run: () => setAddFeedOpen(true) },
    { id: "open:x", group: "open", label: "X reading panel", run: () => setPrefs((p) => ({ ...p, view: "x" })) },
    { id: "open:help", group: "open", label: "Keyboard shortcuts", hint: "?", run: () => setHelpOpen(true) },
    ...(queryInput
      ? [{ id: "clear:search", group: "feeds", label: `Clear search filter (“${queryInput}”)`, run: () => setQueryInput("") }]
      : []),
    { id: "clear:seen", group: "feeds", label: "Mark collected stories unread", run: clearSeen },
  ];

  return (
    <ReadingProvider>
      <Header
        category={prefs.category}
        onCategoryChange={setCategory}
        view={prefs.view}
        onViewChange={(view) => setPrefs((p) => ({ ...p, view }))}
        queryInput={queryInput}
        onQueryInputChange={setQueryInput}
        onOpenSettings={() => setSettingsOpen(true)}
        settingsOpen={settingsOpen}
      />

      {library.storageWarning && <div role="status" className="shrink-0 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">{library.storageWarning} Keep this tab open and export a backup from Library.</div>}
      {!ready ? (
        <DeckPlaceholder />
      ) : prefs.view === "brief" ? (
        <BriefView category={prefs.category} refreshKey={refresh.key} />
      ) : prefs.view === "x" ? (
        <XReadingPanel refreshKey={refresh.key} />
      ) : prefs.view === "library" ? (
        <ResearchScreen
          feeds={visibleFeeds}
          category={prefs.category}
          refreshKey={refresh.key}
          query={queryInput}
          onQueryChange={setQueryInput}
        />
      ) : (
        <ColumnDeck
          items={deckItems}
          category={prefs.category}
          refreshKey={refresh.key}
          sortMode={prefs.sortMode}
          query={query}
          onReorder={handleReorder}
        />
      )}

      {prefs.view === "deck" ? <StatusBar
        items={deckItems}
        lastRefreshAt={refresh.at}
        refreshMs={prefs.refreshMs}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
      /> : <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-200 px-4 py-1 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        <span>Personal library · stored in this browser</span>
        <div className="flex gap-2"><button className="action-button" onClick={() => setHelpOpen(true)} aria-label="Keyboard shortcuts">?</button><button className="action-button" onClick={() => setPaletteOpen(true)} aria-label="Open command palette">⌘ K</button></div>
      </footer>}

      {settingsOpen && <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={prefs}
        setPrefs={setPrefs}
        onRefresh={bumpRefresh}
        onOpenX={() => { setSettingsOpen(false); setPrefs((p) => ({ ...p, view: "x" })); }}
        onOpenHelp={() => { setSettingsOpen(false); setHelpOpen(true); }}
        onAddFeed={() => {
          setSettingsOpen(false);
          setAddFeedOpen(true);
        }}
      />}
      {addFeedOpen && <AddFeedDialog
        open={addFeedOpen}
        onClose={() => setAddFeedOpen(false)}
        onAdd={(feed) => setPrefs((p) => ({ ...p, custom: [...p.custom, feed] }))}
      />}
      {helpOpen && <ShortcutsOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />}
      {paletteOpen && <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />}
    </ReadingProvider>
  );
}

/** Server-rendered first paint while localStorage prefs load — mirrors the
 *  real deck's wrapper structure so there's no layout jump. */
function DeckPlaceholder() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden px-4 py-8" role="status" aria-label="Loading reader">
      <div className="mx-auto max-w-[780px] space-y-8"><div className="skeleton h-10 w-2/3" /><div className="skeleton h-12 w-full" />
        {[1, 2, 3].map((n) => <div key={n} className="space-y-3"><div className="skeleton h-6 w-4/5" /><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-3/4" /></div>)}</div>
    </div>
  );
}
