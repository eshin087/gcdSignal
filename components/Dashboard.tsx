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
import AddFeedDialog from "./AddFeedDialog";
import ColumnDeck from "./ColumnDeck";
import CommandPalette, { type Command } from "./CommandPalette";
import ForYouFeed from "./ForYouFeed";
import Header from "./Header";
import NewsletterDialog from "./NewsletterDialog";
import SavedDrawer from "./SavedDrawer";
import SettingsDrawer from "./SettingsDrawer";
import ShortcutsOverlay from "./ShortcutsOverlay";
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
  const [newsletterOpen, setNewsletterOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
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
      id: "view:foryou",
      group: "view",
      label: "For You feed",
      hint: prefs.view === "foryou" ? "current" : undefined,
      run: () => setPrefs((p) => ({ ...p, view: "foryou" })),
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
    { id: "open:saved", group: "open", label: "Saved items", run: () => setSavedOpen(true) },
    { id: "open:settings", group: "open", label: "Feed settings", run: () => setSettingsOpen(true) },
    { id: "open:add", group: "open", label: "Add a feed", run: () => setAddFeedOpen(true) },
    { id: "open:subscribe", group: "open", label: "Subscribe to the daily digest", run: () => setNewsletterOpen(true) },
    { id: "open:help", group: "open", label: "Keyboard shortcuts", hint: "?", run: () => setHelpOpen(true) },
    ...(queryInput
      ? [{ id: "clear:search", group: "feeds", label: `Clear search filter (“${queryInput}”)`, run: () => setQueryInput("") }]
      : []),
    { id: "clear:seen", group: "feeds", label: "Clear seen history", run: clearSeen },
  ];

  return (
    <>
      <Header
        category={prefs.category}
        onCategoryChange={setCategory}
        lastRefreshAt={refresh.at}
        onRefresh={bumpRefresh}
        refreshMs={prefs.refreshMs}
        onRefreshMsChange={(ms) => setPrefs((p) => ({ ...p, refreshMs: ms }))}
        view={prefs.view}
        onViewChange={(view) => setPrefs((p) => ({ ...p, view }))}
        sortMode={prefs.sortMode}
        onSortModeChange={(sortMode) => setPrefs((p) => ({ ...p, sortMode }))}
        textScale={prefs.textScale}
        onTextScaleChange={(t) => setPrefs((p) => ({ ...p, textScale: t }))}
        density={prefs.density}
        onDensityChange={(d) => setPrefs((p) => ({ ...p, density: d }))}
        queryInput={queryInput}
        onQueryInputChange={setQueryInput}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenNewsletter={() => setNewsletterOpen(true)}
        onOpenSaved={() => setSavedOpen(true)}
      />

      {!ready ? (
        <DeckPlaceholder />
      ) : prefs.view === "foryou" ? (
        <ForYouFeed
          feeds={visibleFeeds}
          category={prefs.category}
          refreshKey={refresh.key}
          sortMode={prefs.sortMode}
          query={query}
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

      <StatusBar
        items={deckItems}
        lastRefreshAt={refresh.at}
        refreshMs={prefs.refreshMs}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={prefs}
        setPrefs={setPrefs}
        onAddFeed={() => {
          setSettingsOpen(false);
          setAddFeedOpen(true);
        }}
      />
      <AddFeedDialog
        open={addFeedOpen}
        onClose={() => setAddFeedOpen(false)}
        onAdd={(feed) => setPrefs((p) => ({ ...p, custom: [...p.custom, feed] }))}
      />
      <NewsletterDialog open={newsletterOpen} onClose={() => setNewsletterOpen(false)} />
      <SavedDrawer open={savedOpen} onClose={() => setSavedOpen(false)} />
      <ShortcutsOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </>
  );
}

/** Server-rendered first paint while localStorage prefs load — mirrors the
 *  real deck's wrapper structure so there's no layout jump. */
function DeckPlaceholder() {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="mx-auto flex h-full min-w-max gap-0 md:gap-3 md:px-3 md:py-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="w-screen flex-none overflow-hidden bg-white p-3 md:w-[340px] md:rounded-xl md:border md:border-black/[0.07] xl:w-[360px] dark:bg-[#111114]/80"
          >
            <div className="skeleton mb-5 h-3 w-24" />
            {Array.from({ length: 6 }, (_, j) => (
              <div key={j} className="mb-4 space-y-1.5">
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-3/4" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
