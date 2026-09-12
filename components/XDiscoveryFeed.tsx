"use client";

import { useEffect, useRef, useState } from "react";
import { timeAgo } from "@/lib/fetch-helpers";
import { parseXLink } from "@/lib/x-links";
import { loadWidgets } from "@/lib/x-widgets";
import { useDialog } from "@/lib/use-dialog";
import type { XDiscoveryPost, XDiscoveryResponse } from "@/lib/x-discovery-types";

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

export default function XDiscoveryFeed({ refreshKey, savedUrls, ready, onSave }: {
  refreshKey: number; savedUrls: string[]; ready: boolean; onSave: (url: string) => boolean;
}) {
  const [data, setData] = useState<XDiscoveryResponse | null>(null);
  const [pending, setPending] = useState<XDiscoveryResponse | null>(null);
  const [failure, setFailure] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
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
  }, [refreshKey, attempt]);

  const cutoff = viewTime - windowHours * 3600_000;
  const filtered = (data?.items ?? []).filter((post) => Date.parse(post.sharedAt) >= cutoff &&
    `${post.title} ${post.excerpt ?? ""} ${post.author}`.toLowerCase().includes(query.toLowerCase().trim()));
  if (sort === "new") filtered.sort((a, b) => Date.parse(b.sharedAt) - Date.parse(a.sharedAt));
  const savedIds = new Set(savedUrls.map((url) => parseXLink(url)?.postId).filter(Boolean));
  const problem = failure || data?.error;

  return <section aria-label="X discoveries" className="mx-auto max-w-3xl">
    <p className="mb-4 text-xs leading-5 text-zinc-600 dark:text-zinc-400">Popular in public coverage from Hacker News and Latent Space. X likes and reposts are not measured here.</p>
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Shared within
        <select className="reader-input mt-1 block min-h-11" value={windowHours} onChange={(event) => { setWindowHours(Number(event.target.value)); setViewTime(Date.now()); setLimit(20); }}>
          <option value={24}>24 hours</option><option value={72}>3 days</option><option value={168}>7 days</option>
        </select>
      </label>
      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Order
        <select className="reader-input mt-1 block min-h-11" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="popular">Popular</option><option value="new">Newly shared</option>
        </select>
      </label>
      <button className="action-button min-h-11" aria-expanded={filterOpen} aria-controls="x-discovery-filter" onClick={() => setFilterOpen((open) => !open)}>Filter{query ? " · 1" : ""}</button>
    </div>
    {filterOpen && <label id="x-discovery-filter" className="mb-4 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Filter discoveries
      <input type="search" className="reader-input mt-1 block min-h-11 w-full" placeholder="Company, topic, or author" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(20); }} />
    </label>}
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-400">
      <span>{data ? `${filtered.length} posts · checked ${timeAgo(data.fetchedAt)}` : "Checking public sources"}</span>
      <button className="action-button min-h-11" aria-label="Check for updates" disabled={loading} onClick={() => setAttempt((value) => value + 1)}>{loading ? "Checking…" : "Refresh"}</button>
    </div>
    {pending && <button className="action-button reader-primary mb-4 min-h-11 w-full" onClick={() => {
      displayed.current = pending; setData(pending); setPending(null); setViewTime(Date.now()); setLimit(20);
    }}>Show updated discoveries</button>}
    {problem && <p role="status" className="mb-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:bg-amber-950/40 dark:text-amber-200">{problem}{data?.items.length ? " Showing the last available discoveries." : " Your saved sources are still available."}</p>}
    {data && <details className="mb-3 text-xs leading-6 text-zinc-600 dark:text-zinc-400">
      <summary className="min-h-11 cursor-pointer py-2">{data.health.degraded || data.stale ? "Partial or delayed coverage" : "Source coverage"}</summary>
      <ul className="mt-1 space-y-1">
        {data.health.details?.map((source) => <li key={source.id}>{source.id.startsWith("hackernews") ? "Hacker News" : "Latent Space"}{source.id.includes(":") ? ` (${source.id.split(":")[1]})` : ""}: {source.status === "ok" ? "available" : source.status === "stale" ? "using an older result" : "unavailable"}{source.lastSuccessAt ? ` · last success ${timeAgo(source.lastSuccessAt)}` : ""}</li>)}
      </ul>
      <p className="mt-2">Sources update on their own schedules. Requests are cached for five minutes. Dates below describe when a source shared the link; the original X post may be older.</p>
    </details>}
    {!data && loading && <p role="status" className="py-12 text-center text-sm text-zinc-600 dark:text-zinc-400">Finding AI posts from public sources…</p>}
    {data && !filtered.length && <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
      <h2 className="font-semibold">No discoveries match this view yet</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">Try a longer sharing window or clear your filter. New posts appear when the sources cover them.</p>
    </div>}
    <div className="space-y-4">
      {filtered.slice(0, limit).map((post) => {
        const saved = savedIds.has(parseXLink(post.url)?.postId);
        return <article key={post.id} className="break-words rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-400"><span className="font-medium">@{post.author}</span><time dateTime={post.sharedAt}>Shared {timeAgo(post.sharedAt)}</time></div>
          <h2 className="mt-3 text-lg font-semibold leading-7 tracking-tight"><a href={post.url} target="_blank" rel="noopener noreferrer" className="hover:text-teal-700 dark:hover:text-teal-300">{post.title}</a></h2>
          {post.excerpt && <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{post.excerpt}</p>}
          <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">Source description · read the original post for its full context</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-6 text-teal-800 dark:text-teal-300">
            {post.mentions.map((mention) => <a key={`${mention.source}:${mention.sourceUrl}`} href={mention.sourceUrl} target="_blank" rel="noopener noreferrer" className="min-h-11 py-2 underline decoration-teal-500/30 underline-offset-4">{mention.source === "hackernews" ? "Hacker News" : "Latent Space"}{mention.points !== undefined ? ` · ${mention.points} HN points` : ""}{mention.comments !== undefined ? ` · ${mention.comments} comments` : ""} ↗</a>)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="action-button reader-primary min-h-11" href={post.url} target="_blank" rel="noopener noreferrer">Open on X ↗</a>
            <button className="action-button min-h-11" onClick={() => setPreview(post)}>Load post from X</button>
            <button className="action-button min-h-11" disabled={!ready || saved} onClick={() => setNotice(onSave(post.url) ? "Post added to Saved sources." : "Your 50 saved-link slots are full. Remove a saved source to make room.")}>{saved ? "Saved" : "Save post"}</button>
          </div>
          <details className="mt-2 text-xs leading-6 text-zinc-600 dark:text-zinc-400"><summary className="min-h-11 cursor-pointer py-2">Why this post?</summary><ul className="list-disc space-y-1 pl-4">{post.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>
        </article>;
      })}
    </div>
    {filtered.length > limit && <button className="action-button my-5 min-h-11 w-full" onClick={() => setLimit((value) => value + 20)}>Show more discoveries</button>}
    <p role="status" className="mt-4 text-sm text-teal-800 dark:text-teal-300">{notice}</p>
    <p className="mt-4 text-xs leading-6 text-zinc-500 dark:text-zinc-400">No accounts to add. X only loads when you open a link or choose Load post from X. Discovery descriptions come from the linked sources and are separate from your research library.</p>
    {preview && <PostPreview key={preview.id} post={preview} onClose={() => setPreview(null)} />}
  </section>;
}
