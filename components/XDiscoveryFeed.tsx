"use client";

import { useEffect, useRef, useState } from "react";
import { timeAgo } from "@/lib/fetch-helpers";
import { parseXLink } from "@/lib/x-links";
import { loadWidgets } from "@/lib/x-widgets";
import { useDialog } from "@/lib/use-dialog";
import { clearHealth, reportHealth } from "@/lib/feed-health";
import type { XDiscoveryPost, XDiscoveryResponse } from "@/lib/x-discovery-types";
import XDiscoveryCard from "./XDiscoveryCard";

const URL = "/api/feeds/x-discovery";
let snapshot: { data: XDiscoveryResponse; receivedAt: number } | null = null;
let inflight: Promise<XDiscoveryResponse> | null = null;

function loadDiscovery(): Promise<XDiscoveryResponse> {
  if (snapshot && Date.now() - snapshot.receivedAt < 300_000) return Promise.resolve(snapshot.data);
  if (inflight) return inflight;
  inflight = fetch(URL, { signal: AbortSignal.timeout(20_000) }).then(async (response) => {
    if (!response.ok) throw new Error("Discovery is temporarily unavailable.");
    const data: XDiscoveryResponse = await response.json();
    if (data.schemaVersion !== 1 || !Array.isArray(data.items) || !data.health || !data.fetchedAt) {
      throw new Error("Discovery returned an unexpected response.");
    }
    const usable = data.error && !data.items.length && snapshot?.data.items.length
      ? { ...snapshot.data, health: data.health, stale: true, error: data.error }
      : data;
    snapshot = { data: usable, receivedAt: Date.now() };
    return usable;
  }).finally(() => { inflight = null; });
  return inflight;
}

function PostPreview({ post, onClose }: { post: XDiscoveryPost; onClose: () => void }) {
  const dialog = useDialog(true);
  const host = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const postId = parseXLink(post.url)?.postId;
  useEffect(() => {
    if (!host.current || !postId) return;
    const element = document.createElement("div");
    host.current.replaceChildren(element);
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      active = false;
      element.remove();
      setStatus("error");
    }, 15_000);
    void loadWidgets().then((widgets) => {
      if (!active) return;
      return widgets.createTweet(postId, element, { dnt: true, theme: document.documentElement.classList.contains("dark") ? "dark" : "light" });
    }).then((result) => {
      if (!active) return;
      clearTimeout(timer);
      if (!result) element.remove();
      setStatus(result ? "ready" : "error");
    }).catch(() => {
      if (!active) return;
      clearTimeout(timer);
      element.remove();
      setStatus("error");
    });
    return () => { active = false; clearTimeout(timer); element.remove(); };
  }, [postId, attempt]);

  return <dialog ref={dialog} className="app-modal" aria-label="X post preview" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="min-w-0 break-words font-semibold">@{post.author} on X</h2>
        <button className="action-button min-h-11" onClick={onClose} aria-label="Close X post preview">Close</button>
      </header>
      <a className="action-button min-h-11" href={post.url} target="_blank" rel="noopener noreferrer">Open on X ↗</a>
      {status === "loading" && <p role="status" className="py-5 text-sm text-zinc-600 dark:text-zinc-400">Loading the original post from X…</p>}
      {status === "error" && <div role="status" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:bg-amber-950/40 dark:text-amber-200">
        <p>X could not display this post. It may require sign-in or no longer be public. You can still open the original link.</p>
        <button className="action-button mt-3 min-h-11" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}>Retry post</button>
      </div>}
      <div ref={host} className="mt-3 min-w-0 overflow-hidden [&_iframe]:max-w-full" aria-busy={status === "loading"} />
    </div>
  </dialog>;
}

export default function XDiscoveryFeed({ refreshKey, savedUrls, ready, onSave, onLoadingChange }: {
  refreshKey: number; savedUrls: string[]; ready: boolean; onSave: (url: string) => boolean; onLoadingChange: (loading: boolean) => void;
}) {
  const [data, setData] = useState<XDiscoveryResponse | null>(null);
  const [pending, setPending] = useState<XDiscoveryResponse | null>(null);
  const [failure, setFailure] = useState("");
  const [loading, setLoading] = useState(true);
  const [windowHours, setWindowHours] = useState(72);
  const [sort, setSort] = useState("popular");
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [limit, setLimit] = useState(20);
  const [viewTime, setViewTime] = useState(Date.now);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<XDiscoveryPost | null>(null);
  const displayed = useRef<XDiscoveryResponse | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      if (!displayed.current && snapshot) { displayed.current = snapshot.data; setData(snapshot.data); }
      setLoading(true);
      setFailure("");
    });
    void loadDiscovery().then((next) => {
      if (!active) return;
      const current = displayed.current;
      if (current?.items.length && JSON.stringify(current.items) !== JSON.stringify(next.items) && next.items.length) {
        setPending(next);
        // Surface failures immediately even while reordered cards wait.
        setData({ ...current, health: next.health, stale: next.stale, error: next.error });
      } else if (current?.items.length && next.error && !next.items.length) {
        setFailure(next.error);
      } else {
        if (!current?.items.length) setViewTime(Date.now());
        displayed.current = next;
        setData(next);
        setPending(null);
      }
    }).catch((error) => {
      if (active) setFailure(error instanceof Error ? error.message : "Discovery could not load.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey]);

  const cutoff = viewTime - windowHours * 3600_000;
  const filtered = (data?.items ?? []).filter((post) => Date.parse(post.sharedAt) >= cutoff &&
    `${post.title} ${post.excerpt ?? ""} ${post.author}`.toLowerCase().includes(query.toLowerCase().trim()));
  if (sort === "new") filtered.sort((a, b) => Date.parse(b.sharedAt) - Date.parse(a.sharedAt));
  const savedIds = new Set(savedUrls.map((url) => parseXLink(url)?.postId).filter(Boolean));
  const problem = failure || data?.error;

  useEffect(() => {
    reportHealth("x-discovery", {
      status: problem || data?.health.degraded || data?.stale ? (data?.items.length ? "stale" : "error") : loading ? "loading" : data ? "ok" : "idle",
      count: data?.items.length ?? 0,
      fetchedAt: data?.fetchedAt,
    });
  }, [problem, data, loading]);
  useEffect(() => () => clearHealth("x-discovery"), []);
  useEffect(() => { onLoadingChange(loading); }, [loading, onLoadingChange]);

  return <section aria-label="X discoveries">
    <div className="flex items-start gap-2 border-b border-black/[0.06] px-3 dark:border-white/[0.06]">
      <details className="min-w-0 flex-1 text-[length:var(--fs-ui-sm)] leading-relaxed text-zinc-500 dark:text-zinc-400">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 font-mono" title="Coverage and selection details">All AI · {sort === "popular" ? "Popular" : "Newly shared"} · {windowHours / 24}d <span aria-hidden>⌄</span><span className="sr-only"> · Source coverage</span></summary>
        <div className="pb-3">
          <p className="font-medium">{data?.health.degraded || data?.stale ? "Partial or delayed coverage" : "Source coverage"}</p>
          <p className="mt-1">{data ? `${filtered.length} ${filtered.length === 1 ? "post" : "posts"} · checked ${timeAgo(data.fetchedAt)}` : "Checking public sources"}</p>
          <ul className="mt-2 space-y-1">
            {data?.health.details?.map((source) => <li key={source.id}>{source.id.startsWith("hackernews") ? "Hacker News" : "Latent Space"}{source.id.includes(":") ? ` (${source.id.split(":")[1]})` : ""}: {source.status === "ok" ? "available" : source.status === "stale" ? "using an older result" : "unavailable"}{source.lastSuccessAt ? ` · last success ${timeAgo(source.lastSuccessAt)}` : ""}</li>)}
          </ul>
          <p className="mt-2">AI links from Hacker News and Latent Space, ranked by source activity—not X likes. The headline and excerpt describe the citing source, not a transcript of the post.</p>
          <p className="mt-2">This column covers All AI independently of the main topic tabs and Builder filter. Use Filter for its own text/date controls.</p>
          <p className="mt-2">Requests are cached for five minutes. Shared dates describe when a source linked the post; the original X post may be older. Sources can lag behind X.</p>
          <p className="mt-2">No X requests happen until you open a link or load a post. Saved X links have their own export, separate from Library.</p>
        </div>
      </details>
      <button className="min-h-11 shrink-0 px-2 text-[length:var(--fs-ui-sm)] font-medium text-cyan-700 hover:bg-cyan-500/10 dark:text-cyan-300" aria-label="Filter" aria-expanded={filterOpen} aria-controls="x-discovery-filter" onClick={() => setFilterOpen((open) => !open)}>Filter{query ? " · 1" : ""}</button>
    </div>
    {filterOpen && <div id="x-discovery-filter" className="space-y-3 border-b border-black/[0.06] bg-black/[0.02] p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-[length:var(--fs-ui-sm)] font-medium text-zinc-600 dark:text-zinc-400">Shared within
          <select className="reader-input mt-1 block min-h-11 w-full" value={windowHours} onChange={(event) => { setWindowHours(Number(event.target.value)); setViewTime(Date.now()); setLimit(20); }}>
            <option value={24}>24 hours</option><option value={72}>3 days</option><option value={168}>7 days</option>
          </select>
        </label>
        <label className="text-[length:var(--fs-ui-sm)] font-medium text-zinc-600 dark:text-zinc-400">Order
          <select className="reader-input mt-1 block min-h-11 w-full" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="popular">Popular</option><option value="new">Newly shared</option>
          </select>
        </label>
      </div>
      <label className="block text-[length:var(--fs-ui-sm)] font-medium text-zinc-600 dark:text-zinc-400">Filter discoveries
        <input type="search" className="reader-input mt-1 block min-h-11 w-full" placeholder="Company, topic, or author" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(20); }} />
      </label>
    </div>}
    {pending && <div className="pointer-events-none sticky top-2 z-10 flex justify-center"><button className="pointer-events-auto min-h-11 rounded-full bg-cyan-500 px-3 font-mono text-[length:var(--fs-ui-sm)] font-semibold text-white shadow-lg shadow-cyan-500/30 dark:bg-cyan-400 dark:text-cyan-950" onClick={() => {
      displayed.current = pending; setData(pending); setPending(null); setViewTime(Date.now()); setLimit(20);
    }}>Show updated discoveries</button></div>}
    {(problem || data?.health.degraded || data?.stale) && <p role="status" className="border-b border-amber-500/20 bg-amber-500/[0.07] px-3 py-2 text-[length:var(--fs-ui-sm)] leading-relaxed text-amber-800 dark:text-amber-300">{problem || "Partial or delayed coverage."}{data?.items.length ? " Showing available discoveries; check source coverage for details." : " Your saved sources are still available."}</p>}
    {!data && loading && <p role="status" className="py-12 text-center text-sm text-zinc-600 dark:text-zinc-400">Finding AI posts from public sources…</p>}
    {data && !filtered.length && <div className="px-4 py-10 text-center">
      <h3 className="text-[length:var(--fs-title)] font-medium text-zinc-600 dark:text-zinc-300">No discoveries match this view yet</h3>
      <p className="mt-2 text-[length:var(--fs-meta)] leading-relaxed text-zinc-500 dark:text-zinc-400">Try a longer sharing window or clear your filter. New posts appear when the sources cover them.</p>
    </div>}
    <div>
      {filtered.slice(0, limit).map((post) => {
        const saved = savedIds.has(parseXLink(post.url)?.postId);
        return <XDiscoveryCard key={post.id} post={post} saved={saved} ready={ready} onPreview={() => setPreview(post)} onSave={() => setNotice(onSave(post.url) ? "Post added to Saved sources." : "Your 50 saved-link slots are full. Remove a saved source to make room.")} />;
      })}
    </div>
    {filtered.length > limit && <button className="min-h-11 w-full px-3 font-mono text-[length:var(--fs-ui-sm)] text-cyan-700 hover:bg-cyan-500/10 dark:text-cyan-300" onClick={() => setLimit((value) => value + 20)}>Show more discoveries</button>}
    <p role="status" className={notice ? "p-3 text-[length:var(--fs-ui-sm)] text-cyan-700 dark:text-cyan-300" : "sr-only"}>{notice}</p>
    {preview && <PostPreview key={preview.id} post={preview} onClose={() => setPreview(null)} />}
  </section>;
}
