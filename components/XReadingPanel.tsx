"use client";

import { useEffect, useRef, useState } from "react";
import { parseXLink, type XLink } from "@/lib/x-links";
import { loadWidgets } from "@/lib/x-widgets";
import { useDeckHealth } from "@/lib/feed-health";
import XDiscoveryFeed from "./XDiscoveryFeed";
import { COLUMN_HEADER, COLUMN_SHELL } from "./column-shell";
import { BookmarkIcon, RefreshIcon, XBrandIcon } from "./icons";

const KEY = "gcdsignal:x-links:v1";
const LIMIT = 50;
const READ_WARNING = "Saved X links could not be read. To protect them, new changes are kept in this tab. Export a backup before reloading or closing it.";
const WRITE_WARNING = "These links are kept in this tab while you browse Signal. Browser storage is unavailable or full. Export a backup before reloading or closing this tab.";
// Keep failed saves when this view unmounts during navigation. Never replace
// storage that could not be read; it may contain links we could not recover.
let linkRecovery: { links: XLink[]; warning: string; canPersist: boolean } | null = null;
function updateLinkRecovery(value: typeof linkRecovery) { linkRecovery = value; }
type EmbedStatus = "idle" | "loading" | "ready" | "error";

function labelFor(link: XLink): string {
  const parts = new URL(link.url).pathname.split("/").filter(Boolean);
  if (link.kind === "profile") return "@" + parts[0];
  if (link.kind === "post") return "@" + parts[0] + " · post " + link.postId;
  return parts[0] === "i" ? "List · " + parts[2] : parts[2].replace(/-/g, " ") + " · @" + parts[0];
}

export default function XReadingPanel({ refreshKey = 0, dragHandleProps }: {
  refreshKey?: number; dragHandleProps?: React.HTMLAttributes<HTMLElement>;
}) {
  const [section, setSection] = useState<"discover" | "sources">("discover");
  const [manualRefresh, setManualRefresh] = useState(0);
  const [refreshing, setRefreshing] = useState(true);
  const feedHealth = useDeckHealth().get("x-discovery");
  const health = feedHealth?.status ?? "loading";
  const [input, setInput] = useState("");
  const [links, setLinks] = useState<XLink[]>([]);
  const [selected, setSelected] = useState<XLink | null>(null);
  const [request, setRequest] = useState<{ link: XLink; id: number } | null>(null);
  const [status, setStatus] = useState<EmbedStatus>("idle");
  const [inputError, setInputError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [canSave, setCanSave] = useState(true);
  const [restored, setRestored] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const storageReadable = useRef(true);

  useEffect(() => {
    let disposed = false;
    void Promise.resolve().then(() => {
      if (disposed) return;
      if (linkRecovery) {
        storageReadable.current = linkRecovery.canPersist;
        setCanSave(linkRecovery.canPersist);
        setLinks(linkRecovery.links);
        setSelected(linkRecovery.links[0] ?? null);
        setStorageError(linkRecovery.warning);
        setRestored(true);
        return;
      }
      try {
        const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
        if (!Array.isArray(stored) || stored.length > LIMIT) throw new Error("Invalid saved links.");
        const urls = new Set<string>();
        const saved = stored.flatMap((raw): XLink[] => {
          const link = typeof raw === "string" ? parseXLink(raw) : null;
          if (!link) throw new Error("Invalid saved link.");
          if (urls.has(link.url)) return [];
          urls.add(link.url);
          return [link];
        });
        setLinks(saved);
        setSelected(saved[0] ?? null);
      } catch {
        storageReadable.current = false;
        setCanSave(false);
        updateLinkRecovery({ links: [], warning: READ_WARNING, canPersist: false });
        setStorageError(READ_WARNING);
      }
      setRestored(true);
    });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!request || !host.current) return;
    let disposed = false;
    let timedOut = false;
    const element = document.createElement("div");
    const container = host.current;
    container.replaceChildren(element);
    const current = () => !disposed && !timedOut && generation.current === request.id;
    const timeout = setTimeout(() => {
      if (!current()) return;
      timedOut = true;
      element.remove();
      setStatus("error");
    }, 15000);
    void loadWidgets().then((widgets) => {
      if (!current()) return;
      const options = {
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
        dnt: true,
        height: 640,
      };
      return request.link.kind === "post"
        ? widgets.createTweet(request.link.postId!, element, options)
        : widgets.createTimeline({ sourceType: "url", url: request.link.url }, element, options);
    }).then((embed) => {
      if (!current()) return;
      clearTimeout(timeout);
      if (!embed) element.remove();
      setStatus(embed ? "ready" : "error");
    }).catch(() => {
      if (!current()) return;
      clearTimeout(timeout);
      element.remove();
      setStatus("error");
    });
    return () => {
      disposed = true;
      clearTimeout(timeout);
      // Pending widget work can only write into this detached element.
      element.remove();
    };
  }, [request]);

  const choose = (link: XLink | null) => {
    generation.current += 1;
    setSelected(link);
    setRequest(null);
    setStatus("idle");
  };
  const load = () => {
    if (!selected) return;
    const id = ++generation.current;
    setStatus("loading");
    setRequest({ link: selected, id });
  };
  const persist = (next: XLink[]) => {
    setLinks(next);
    if (!storageReadable.current) {
      updateLinkRecovery({ links: next, warning: READ_WARNING, canPersist: false });
      setStorageError(READ_WARNING);
      return;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(next.map((link) => link.url)));
      updateLinkRecovery(null);
      setStorageError("");
    } catch {
      updateLinkRecovery({ links: next, warning: WRITE_WARNING, canPersist: true });
      setStorageError(WRITE_WARNING);
    }
  };
  const add = () => {
    const link = parseXLink(input);
    if (!link) {
      setInputError("Enter an @handle or a public HTTPS X profile, list, or post URL.");
      return;
    }
    const existing = links.find((saved) => saved.url === link.url);
    if (!existing && links.length >= LIMIT) {
      setInputError("You have 50 saved links. Remove one before adding another.");
      return;
    }
    if (!existing) persist([...links, link]);
    choose(existing ?? link);
    setInput("");
    setInputError("");
  };
  const remove = (link: XLink) => {
    const next = links.filter((saved) => saved.url !== link.url);
    persist(next);
    if (selected?.url === link.url) choose(next[0] ?? null);
  };
  const backup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(links.map((link) => link.url), null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "signal-x-links.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section className={COLUMN_SHELL} aria-label="AI on X column">
    <div aria-hidden className="h-[2px] shrink-0 bg-gradient-to-r from-zinc-500/60 via-zinc-500/10 to-transparent dark:from-zinc-300/60 dark:via-zinc-300/10" />
    <header {...dragHandleProps} className={`${COLUMN_HEADER} ${dragHandleProps ? "select-none md:cursor-grab md:active:cursor-grabbing" : ""}`}>
      <span className={`led led-${health}`} aria-label={`Status: ${health}`} />
      <XBrandIcon />
      <h2 className="truncate font-mono text-[length:var(--fs-colhead)] font-semibold lowercase tracking-tight text-zinc-600 dark:text-zinc-300"><span className="text-cyan-500/80 dark:text-cyan-400/80">&gt;&nbsp;</span>AI on X</h2>
      <span className="ml-auto flex items-center gap-1">
        {feedHealth && <span className="rounded-full bg-black/[0.04] px-2 py-px font-mono text-[length:var(--fs-ui-sm)] tabular-nums text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400" title={`${feedHealth.count} available discoveries before filters`}>{feedHealth.count}</span>}
        <button className={`flex h-11 w-11 shrink-0 items-center justify-center rounded transition-colors hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-cyan-500/40 dark:hover:bg-white/[0.06] ${section === "sources" ? "text-cyan-600 dark:text-cyan-300" : "text-zinc-500 dark:text-zinc-400"}`} draggable={false} aria-label="Saved sources" title="Saved X sources" aria-pressed={section === "sources"} onClick={() => { choose(selected); setSection(section === "sources" ? "discover" : "sources"); scroll.current?.scrollTo({ top: 0 }); }}><BookmarkIcon filled={section === "sources"} /></button>
        <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-black/[0.05] hover:text-zinc-600 focus-visible:ring-2 focus-visible:ring-cyan-500/40 dark:text-zinc-500 dark:hover:bg-white/[0.06] dark:hover:text-zinc-300" draggable={false} aria-label="Refresh AI on X" title="Refresh AI on X" disabled={refreshing} aria-busy={refreshing} onClick={() => setManualRefresh((value) => value + 1)}><RefreshIcon className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /></button>
      </span>
    </header>
    {section === "sources" && <div className="flex shrink-0 items-center gap-3 border-b border-black/[0.06] px-3 dark:border-white/[0.06]"><button aria-label="Discover" className="min-h-11 text-[length:var(--fs-ui-sm)] font-medium text-cyan-700 dark:text-cyan-300" onClick={() => { choose(selected); setSection("discover"); scroll.current?.scrollTo({ top: 0 }); }}>← Discover</button><span className="ml-auto font-mono text-[length:var(--fs-ui-sm)] text-zinc-500 dark:text-zinc-400">Saved sources · {links.length}</span></div>}
    <div ref={scroll} data-x-scroll className="feed-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain">

      {storageError && <div role="alert" className="m-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.07] p-3 text-xs leading-6 text-amber-900 dark:text-amber-200"><p>{storageError}</p>{canSave && <button className="action-button mt-3" onClick={() => persist(links)}>Retry saving links</button>}</div>}

      <div hidden={section !== "discover"}><XDiscoveryFeed refreshKey={refreshKey + manualRefresh} onLoadingChange={setRefreshing} savedUrls={links.map((link) => link.url)} ready={restored} onSave={(url) => {
        const link = parseXLink(url);
        if (!link || !restored) return false;
        if (links.some((saved) => saved.postId === link.postId)) return true;
        if (links.length >= LIMIT) return false;
        persist([...links, link]);
        if (!selected) choose(link);
        return true;
      }} /></div>
      {section === "sources" && <div className="min-w-0">
        <aside className="min-w-0 border-b border-black/[0.06] p-3 dark:border-white/[0.06]" aria-label="Saved X sources">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Your X sources</h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{links.length} saved</span>
          </div>
          <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); add(); }}>
            <label htmlFor="x-link-input" className="block text-sm font-medium">Add an account or link</label>
            <input ref={inputRef} id="x-link-input" type="text" required maxLength={500} autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={!restored} className="reader-input w-full min-w-0" placeholder="@handle or https://x.com/…" value={input} aria-invalid={Boolean(inputError)} aria-describedby={inputError ? "x-input-error" : "x-source-help"} onChange={(event) => { setInput(event.target.value); setInputError(""); }} />
            <button className="action-button reader-primary w-full" disabled={!restored}>Save source</button>
            {inputError && <p id="x-input-error" role="alert" className="text-sm leading-5 text-red-700 dark:text-red-300">{inputError}</p>}
            <p id="x-source-help" className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">Public accounts and lists only. Saved on this browser.</p>
          </form>

          {links.length > 0 ? <>
            <ul className="mt-5 max-h-64 space-y-2 overflow-y-auto px-1 py-1 lg:max-h-[30rem]">
              {links.map((link) => <li key={link.url} className="flex items-start gap-1">
                <button type="button" className={`min-h-16 min-w-0 flex-1 rounded-xl border px-3 py-3 text-left transition-colors ${selected?.url === link.url ? "border-teal-600 bg-teal-50 dark:border-teal-700 dark:bg-teal-950/50" : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800"}`} aria-pressed={selected?.url === link.url} onClick={() => choose(link)}>
                  <span className="block break-words text-sm font-medium">{labelFor(link)}</span>
                  <span className="mt-1 block text-xs capitalize text-zinc-600 dark:text-zinc-400">{link.kind === "post" ? "Saved post" : link.kind}</span>
                </button>
                <button type="button" className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-red-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-red-300" aria-label={`Remove ${labelFor(link)}`} title="Remove saved source" onClick={() => remove(link)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>
                </button>
              </li>)}
            </ul>
            <button className="action-button mt-4 w-full" onClick={backup}>Export saved links</button>
          </> : <p className="mt-5 border-t border-zinc-100 pt-4 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">{restored ? "Your saved accounts, lists, and posts will appear here." : "Loading your saved links…"}</p>}
        </aside>

        <section className="min-w-0 overflow-hidden" aria-label="X viewer">
          {selected ? <>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] p-3 dark:border-white/[0.06]">
              <div className="min-w-0 flex-1"><h2 className="break-words font-semibold">{labelFor(selected)}</h2><p className="mt-1 break-all text-xs text-zinc-600 dark:text-zinc-400">{selected.url}</p></div>
              <a className="action-button shrink-0" href={selected.url} target="_blank" rel="noopener noreferrer">Open on X ↗</a>
            </header>
            <div className="p-3">
              {status === "idle" && <div className="flex flex-col items-center justify-center px-2 py-5 text-center">
                <p className="text-lg font-semibold">Ready when you are</p>
                <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-600 dark:text-zinc-400">Loading this source connects your browser to X. X controls the posts and their order; updates are not guaranteed to be real time.</p>
                <button className="action-button reader-primary mt-5 px-5" onClick={load}>Load embed</button>
              </div>}
              {status === "loading" && <p role="status" className="rounded-xl bg-zinc-50 p-4 text-sm dark:bg-zinc-800">Loading from X… You can also open this source directly.</p>}
              {status === "error" && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
                <p className="text-sm font-semibold text-amber-950 dark:text-amber-200">X could not display this source</p>
                <p className="mt-2 text-sm leading-6 text-amber-900 dark:text-amber-200">It may be blocked, unavailable, private, or require sign-in. Use Open on X, or try loading it again.</p>
                <button className="action-button mt-3" onClick={load}>Retry embed</button>
              </div>}
              <div ref={host} className="min-w-0 overflow-hidden [&_iframe]:max-w-full" aria-busy={status === "loading"} />
              {status === "ready" && <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-zinc-600 dark:text-zinc-400">Content supplied by X · updates may be delayed</p><button className="action-button" onClick={load}>Reload embed</button></div>}
            </div>
          </> : <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl font-semibold dark:bg-zinc-800" aria-hidden="true">𝕏</span>
            <h2 className="mt-5 text-xl font-semibold">Build your X reading space</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-zinc-600 dark:text-zinc-400">Add an AI researcher, a company account, or a public list you trust. Save individual posts to come back to later.</p>
            <button className="action-button reader-primary mt-5 px-5" disabled={!restored} onClick={() => inputRef.current?.focus()}>Add your first source</button>
            <p className="mt-4 max-w-sm text-xs leading-5 text-zinc-500 dark:text-zinc-400">Nothing loads from X until you choose Load embed.</p>
          </div>}
          <footer className="border-t border-zinc-100 px-4 py-4 sm:px-5 dark:border-zinc-800"><p className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">Free official embeds. X posts are separate from Signal’s Brief and collection search. Embedded timelines may be incomplete or require sign-in.</p></footer>
        </section>
      </div>}
    </div>
  </section>;
}
