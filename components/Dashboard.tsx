"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES, CATEGORY_IDS } from "@/lib/categories";
import {
  BUILT_IN_FEEDS,
  deckKnownIds,
  effectiveOrder,
  isPanelId,
  PANEL_LABELS,
} from "@/lib/feeds";
import { categoryFromParams, VIEW_PATHS, viewFromPathname, viewHref } from "@/lib/routes";
import { SORT_OPTIONS } from "@/lib/sort";
import { useHotkeys } from "@/lib/use-hotkeys";
import { usePrefs } from "@/lib/use-prefs";
import { clearSeen } from "@/lib/use-seen";
import type { CategoryId, DeckItem, Density, TextScale, ViewMode, VisibleFeed } from "@/lib/types";
import dynamic from "next/dynamic";
import ReadingProvider from "./ReadingContext";
import { useLibrary } from "@/lib/use-library";
import { DashboardContext, type DashboardState } from "./DashboardContext";
import DashboardFallback from "./DashboardFallback";
import DeckPlaceholder from "./DeckPlaceholder";
const AddFeedDialog = dynamic(() => import("./AddFeedDialog"));
import type { Command } from "./CommandPalette";
const CommandPalette = dynamic(() => import("./CommandPalette"));
import Header from "./Header";
const SettingsDrawer = dynamic(() => import("./SettingsDrawer"));
const ShortcutsOverlay = dynamic(() => import("./ShortcutsOverlay"));
import StatusBar from "./StatusBar";
import { toggleTheme } from "./ThemeToggle";
import { useReadingQueue } from "@/lib/reading-queue";
const ReadingQueue = dynamic(() => import("./ReadingQueue"));

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

/**
 * The reader shell. It renders from the (reader) layout, so it stays mounted
 * while the route below it decides which view shows; the view itself is the
 * page's `children`. Until stored prefs are ready it paints a static header
 * and placeholder — on the server too, which is why the URL-reading shell
 * below never runs during prerendering and needs no Suspense boundary.
 */
export default function Dashboard({ children }: { children: React.ReactNode }) {
  const { ready } = usePrefs();
  if (!ready) return <DashboardFallback />;
  return <ReaderShell>{children}</ReaderShell>;
}

/**
 * The URL is the source of truth: the pathname picks the view and ?cat= the
 * category. Stored prefs only seed a bare visit — `/` with no query sends an
 * existing reader to their stored view, and a missing ?cat falls back to the
 * stored category, pinned at landing so the back button returns to exactly
 * what that entry showed. Every in-app link carries ?cat=, and each choice is
 * stored on click so the next bare visit resumes where the reader left off.
 */
function ReaderShell({ children }: { children: React.ReactNode }) {
  const { prefs, setPrefs } = usePrefs();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = viewFromPathname(pathname);
  const urlCategory = categoryFromParams(searchParams);

  // Mounted once prefs are ready, so this snapshot is the landing state.
  const [landing] = useState(() => ({
    category: prefs.category,
    redirect: view === "brief" && !urlCategory && prefs.view !== "brief" ? prefs.view : null,
  }));
  useEffect(() => {
    if (landing.redirect) router.replace(VIEW_PATHS[landing.redirect], { scroll: false });
  }, [landing, router]);
  const redirecting = landing.redirect !== null && view === "brief" && !urlCategory;
  const category: CategoryId = urlCategory ?? landing.category;

  // Deep links and back/forward also count as where the reader left off.
  useEffect(() => {
    if (redirecting) return;
    if (prefs.view !== view || (urlCategory && prefs.category !== urlCategory)) {
      setPrefs((p) => ({ ...p, view, category: urlCategory ?? p.category }));
    }
  }, [redirecting, view, urlCategory, prefs.view, prefs.category, setPrefs]);

  const [refresh, setRefresh] = useState(() => ({ key: 0, at: Date.now() }));
  const lastRefreshRef = useRef(refresh.at);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addFeedOpen, setAddFeedOpen] = useState(false);
  const library = useLibrary();
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const queue = useReadingQueue();

  // Session-only search query, debounced so columns don't filter per keystroke.
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQuery(queryInput.trim()), 150);
    return () => clearTimeout(id);
  }, [queryInput]);

  // Programmatic moves (palette, search) go through the router; the pending
  // href stops a burst of keystrokes from pushing the same entry twice.
  const pendingHref = useRef<string | null>(null);
  useEffect(() => { pendingHref.current = null; }, [pathname, searchParams]);
  const choose = useCallback(
    (next: ViewMode, cat: CategoryId) => setPrefs((p) => ({ ...p, view: next, category: cat })),
    [setPrefs]
  );
  const goTo = useCallback((next: ViewMode, cat: CategoryId) => {
    const href = viewHref(next, cat);
    if ((next === view && cat === category) || pendingHref.current === href) return;
    pendingHref.current = href;
    choose(next, cat);
    router.push(href, { scroll: false });
  }, [view, category, choose, router]);
  // Typing in the header search opens the Library, which is what it searches.
  const changeQuery = useCallback((value: string) => {
    setQueryInput(value);
    if (value && view !== "library") goTo("library", category);
  }, [view, category, goTo]);

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

  // Deck slots resolved through the user's stored order (hidden ids filtered
  // at the end so toggling visibility never loses a column's position).
  const { custom, order, hidden } = prefs;
  const { deckItems, visibleFeeds, orderedIds, labelOf } = useMemo(() => {
    const feedById = new Map<string, VisibleFeed>();
    for (const f of BUILT_IN_FEEDS) {
      feedById.set(f.id, { id: f.id, source: f.source, label: f.label, isCustom: false });
    }
    for (const c of custom) {
      feedById.set(c.id, { id: c.id, source: c.source, label: c.label, params: c.params, isCustom: true });
    }
    const orderedIds = effectiveOrder(order, deckKnownIds(custom));
    const labelOf = (id: string) =>
      isPanelId(id) ? PANEL_LABELS[id] : (feedById.get(id)?.label ?? id);
    const deckItems: DeckItem[] = [];
    for (const id of orderedIds) {
      if (hidden.includes(id)) continue;
      if (isPanelId(id)) {
        deckItems.push({ kind: "panel", id, label: PANEL_LABELS[id] });
      } else {
        const feed = feedById.get(id);
        if (feed) deckItems.push({ kind: "feed", id, feed });
      }
    }
    const visibleFeeds = deckItems.flatMap((it) => (it.kind === "feed" ? [it.feed] : []));
    return { deckItems, visibleFeeds, orderedIds, labelOf };
  }, [custom, order, hidden]);

  const handleReorder = useCallback((dragId: string, targetId: string, side: "before" | "after") =>
    setPrefs((p) => {
      const ids = effectiveOrder(p.order, deckKnownIds(p.custom)).filter((id) => id !== dragId);
      const idx = ids.indexOf(targetId);
      if (idx === -1) return p;
      ids.splice(side === "before" ? idx : idx + 1, 0, dragId);
      return { ...p, order: ids };
    }), [setPrefs]);

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

  const showX = !hidden.includes("x-discovery");
  const state: DashboardState = useMemo(() => ({
    category,
    refreshKey: refresh.key,
    queryInput,
    query,
    setQueryInput: changeQuery,
    showX,
    deckItems,
    visibleFeeds,
    sortMode: prefs.sortMode,
    onReorder: handleReorder,
    onFocusChange: setFocusMode,
  }), [category, refresh.key, queryInput, query, changeQuery, showX, deckItems, visibleFeeds, prefs.sortMode, handleReorder]);

  // Command palette — built from the current state each render (cheap).
  const commands: Command[] = [
    ...CATEGORY_IDS.map((id) => ({
      id: `cat:${id}`,
      group: "category",
      label: CATEGORIES[id].label,
      hint: category === id ? "current" : undefined,
      run: () => goTo(view, id),
    })),
    {
      id: "view:deck",
      group: "view",
      label: "Deck view",
      hint: view === "deck" ? "current" : undefined,
      run: () => goTo("deck", category),
    },
    {
      id: "view:brief",
      group: "view",
      label: "Essential Brief",
      hint: view === "brief" ? "current" : undefined,
      run: () => goTo("brief", category),
    },
    ...orderedIds.map((id) => {
      const isHidden = hidden.includes(id);
      return {
        id: `col:${id}`,
        group: "columns",
        label: `${isHidden ? "Show" : "Hide"} ${labelOf(id)}`,
        run: () =>
          setPrefs((p) => ({
            ...p,
            hidden: isHidden ? p.hidden.filter((x) => x !== id) : [...p.hidden, id],
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
    { id: "open:saved", group: "open", label: "Search your collection / saved items", run: () => goTo("library", category) },
    { id: "open:queue", group: "open", label: "Must read queue", run: () => setQueueOpen(true) },
    { id: "open:settings", group: "open", label: "Settings", run: () => setSettingsOpen(true) },
    { id: "open:add", group: "open", label: "Add a feed", run: () => setAddFeedOpen(true) },
    { id: "open:help", group: "open", label: "Keyboard shortcuts", hint: "?", run: () => setHelpOpen(true) },
    ...(queryInput
      ? [{ id: "clear:search", group: "feeds", label: `Clear search filter (“${queryInput}”)`, run: () => setQueryInput("") }]
      : []),
    { id: "clear:seen", group: "feeds", label: "Mark collected stories unread", run: clearSeen },
  ];

  return (
    <ReadingProvider>
      <div hidden={focusMode} className="contents"><Header
        category={category}
        view={view}
        onChoose={choose}
        queryInput={queryInput}
        onQueryInputChange={changeQuery}
        onOpenSettings={() => setSettingsOpen(true)}
        settingsOpen={settingsOpen}
        onOpenQueue={() => setQueueOpen(true)}
        queueOpen={queueOpen}
        queueCount={queue.ready ? queue.items.length : 0}
      /></div>

      {library.storageWarning && <div role="status" className="shrink-0 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">{library.storageWarning} Keep this tab open and export a backup from Library.</div>}
      <DashboardContext.Provider value={state}>
        {redirecting ? <DeckPlaceholder /> : children}
      </DashboardContext.Provider>

      <div hidden={focusMode} className="contents">{view === "deck" ? <StatusBar
        items={deckItems}
        lastRefreshAt={refresh.at}
        refreshMs={prefs.refreshMs}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
      /> : <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-200 px-4 py-1 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        <span>Personal library · stored in this browser</span>
        <div className="flex gap-2"><button className="action-button" onClick={() => setHelpOpen(true)} aria-label="Keyboard shortcuts">?</button><button className="action-button" onClick={() => setPaletteOpen(true)} aria-label="Open command palette">⌘ K</button></div>
      </footer>}</div>

      {settingsOpen && <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={prefs}
        setPrefs={setPrefs}
        onRefresh={bumpRefresh}
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
      {queueOpen && <ReadingQueue open={queueOpen} onClose={() => setQueueOpen(false)} />}
    </ReadingProvider>
  );
}
