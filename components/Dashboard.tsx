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
        refreshMs={prefs.refreshMs}
        onRefreshMsChange={(ms) => setPrefs((p) => ({ ...p, refreshMs: ms }))}
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

/** Server-rendered first paint while localStorage prefs load — mirrors the
 *  real deck's wrapper structure so there's no layout jump. */
function DeckPlaceholder() {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="mx-auto flex h-full min-w-max gap-0 md:gap-3 md:px-3 md:py-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="w-[88vw] max-w-[380px] flex-none overflow-hidden border-r border-black/[0.06] bg-white p-3 first:border-l md:w-[340px] md:rounded-xl md:border md:border-black/[0.07] xl:w-[360px] dark:border-white/[0.07] dark:bg-[#111114]/80"
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
