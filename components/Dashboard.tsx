"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BUILT_IN_FEEDS } from "@/lib/feeds";
import { usePrefs } from "@/lib/use-prefs";
import type { CategoryId, SourceId } from "@/lib/types";
import AddFeedDialog from "./AddFeedDialog";
import ColumnDeck from "./ColumnDeck";
import Header from "./Header";
import NewsletterDialog from "./NewsletterDialog";
import SettingsDrawer from "./SettingsDrawer";

export interface VisibleFeed {
  id: string;
  source: SourceId;
  label: string;
  params?: Record<string, string>;
  isCustom: boolean;
}

const REFRESH_MS = 5 * 60_000;

export default function Dashboard() {
  const { prefs, setPrefs, ready } = usePrefs();
  const [refresh, setRefresh] = useState(() => ({ key: 0, at: Date.now() }));
  const lastRefreshRef = useRef(refresh.at);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addFeedOpen, setAddFeedOpen] = useState(false);
  const [newsletterOpen, setNewsletterOpen] = useState(false);

  const bumpRefresh = useCallback(() => {
    const now = Date.now();
    lastRefreshRef.current = now;
    setRefresh((r) => ({ key: r.key + 1, at: now }));
  }, []);

  // Centralized auto-refresh: bump refreshKey so every column refetches
  // (cheap — the server caches each feed for ~5 minutes anyway).
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) bumpRefresh();
    }, REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastRefreshRef.current > REFRESH_MS) {
        bumpRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [bumpRefresh]);

  const setCategory = (category: CategoryId) => setPrefs((p) => ({ ...p, category }));

  const visibleFeeds: VisibleFeed[] = [
    ...BUILT_IN_FEEDS.filter((f) => !prefs.hidden.includes(f.id)).map((f) => ({
      id: f.id as string,
      source: f.source,
      label: f.label,
      isCustom: false,
    })),
    ...prefs.custom
      .filter((c) => !prefs.hidden.includes(c.id))
      .map((c) => ({ id: c.id, source: c.source, label: c.label, params: c.params, isCustom: true })),
  ];

  return (
    <>
      <Header
        category={prefs.category}
        onCategoryChange={setCategory}
        lastRefreshAt={refresh.at}
        onRefresh={bumpRefresh}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenNewsletter={() => setNewsletterOpen(true)}
      />

      {ready ? (
        <ColumnDeck feeds={visibleFeeds} category={prefs.category} refreshKey={refresh.key} />
      ) : (
        <DeckPlaceholder />
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
    </>
  );
}

/** Server-rendered first paint while localStorage prefs load. */
function DeckPlaceholder() {
  return (
    <div className="flex min-h-0 flex-1 gap-0 overflow-hidden md:gap-3 md:p-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="w-[88vw] max-w-[380px] flex-none border-r border-black/[0.07] bg-white p-3 md:w-[340px] md:rounded-lg md:border dark:border-white/[0.07] dark:bg-[#121214]"
        >
          <div className="skeleton mb-4 h-3 w-24 rounded bg-zinc-300/60 dark:bg-zinc-700/50" />
          {Array.from({ length: 6 }, (_, j) => (
            <div key={j} className="skeleton mb-4 space-y-1.5" style={{ animationDelay: `${j * 120}ms` }}>
              <div className="h-3 w-full rounded bg-zinc-300/60 dark:bg-zinc-700/50" />
              <div className="h-3 w-3/4 rounded bg-zinc-300/60 dark:bg-zinc-700/50" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
