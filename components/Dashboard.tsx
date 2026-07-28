"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BUILT_IN_FEEDS,
  deckKnownIds,
  effectiveOrder,
  isPanelId,
  PANEL_LABELS,
} from "@/lib/feeds";
import { usePrefs } from "@/lib/use-prefs";
import type { CategoryId, DeckItem, VisibleFeed } from "@/lib/types";
import AddFeedDialog from "./AddFeedDialog";
import ColumnDeck from "./ColumnDeck";
import ForYouFeed from "./ForYouFeed";
import Header from "./Header";
import NewsletterDialog from "./NewsletterDialog";
import SavedDrawer from "./SavedDrawer";
import SettingsDrawer from "./SettingsDrawer";

export default function Dashboard() {
  const { prefs, setPrefs, ready } = usePrefs();
  const [refresh, setRefresh] = useState(() => ({ key: 0, at: Date.now() }));
  const lastRefreshRef = useRef(refresh.at);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addFeedOpen, setAddFeedOpen] = useState(false);
  const [newsletterOpen, setNewsletterOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);

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
          onTopicSearch={setQueryInput}
        />
      )}

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
