"use client";

import { useEffect, useRef, useState } from "react";
import { useDialog } from "@/lib/use-dialog";
import { parseXLink, type XLink } from "@/lib/x-links";

interface Widgets {
  createTimeline: (source: { sourceType: "url"; url: string }, element: HTMLElement, options: object) => Promise<HTMLElement | undefined>;
  createTweet: (id: string, element: HTMLElement, options: object) => Promise<HTMLElement | undefined>;
}
let scriptTask: Promise<Widgets> | undefined;
function loadWidgets(): Promise<Widgets> {
  if (scriptTask) return scriptTask;
  scriptTask = new Promise<Widgets>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://platform.twitter.com/widgets.js";
    script.async = true;
    const timeout = setTimeout(() => reject(new Error("X did not respond.")), 8000);
    script.onload = () => {
      clearTimeout(timeout);
      const widgets = (window as Window & { twttr?: { widgets?: Widgets } }).twttr?.widgets;
      if (widgets) resolve(widgets); else reject(new Error("X widgets unavailable."));
    };
    script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error("X could not load.")); };
    document.head.appendChild(script);
  }).catch((error) => { scriptTask = undefined; throw error; });
  return scriptTask;
}
const KEY = "gcdsignal:x-links:v1";
export default function XReadingPanel({ onClose }: { onClose: () => void }) {
  const dialog = useDialog(true);
  const [input, setInput] = useState("");
  const [links, setLinks] = useState<XLink[]>([]);
  const [active, setActive] = useState<XLink | null>(null);
  const [message, setMessage] = useState("");
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
        if (Array.isArray(stored)) setLinks(stored.slice(0, 50).flatMap((r) => typeof r === "string" && parseXLink(r) ? [parseXLink(r)!] : []));
      } catch { setMessage("Link storage is unavailable. Links still work for this visit."); }
    });
  }, []);
  useEffect(() => {
    if (!active || !host.current) return;
    let alive = true;
    const element = host.current;
    element.replaceChildren();
    const timeout = setTimeout(() => { if (alive) setMessage("The embed may be blocked or require sign-in. Open on X still works."); }, 10000);
    void loadWidgets().then((widgets) => {
      if (!alive) return;
      const options = { theme: document.documentElement.classList.contains("dark") ? "dark" : "light", dnt: true, height: 550 };
      return active.kind === "post" ? widgets.createTweet(active.postId!, element, options) : widgets.createTimeline({ sourceType: "url", url: active.url }, element, options);
    }).then((embed) => {
      if (!alive) return;
      clearTimeout(timeout);
      setMessage(embed ? "" : "X did not provide an embed. Open the link directly instead.");
    }).catch(() => {
      if (alive) setMessage("X is unavailable or blocked. Use Open on X below.");
      clearTimeout(timeout);
    });
    return () => { alive = false; clearTimeout(timeout); element.replaceChildren(); };
  }, [active]);
  const persist = (next: XLink[]) => {
    setLinks(next);
    try { localStorage.setItem(KEY, JSON.stringify(next.map((l) => l.url))); }
    catch { setMessage("Could not save these links. Export a backup before closing this tab."); }
  };
  const add = () => {
    const link = parseXLink(input.trim());
    if (!link) { setMessage("Enter a public HTTPS X profile, list, or individual post URL."); return; }
    if (!links.some((l) => l.url === link.url)) {
      if (links.length >= 50) { setMessage("This panel holds 50 links. Remove one before adding another."); return; }
      persist([...links, link]);
    }
    setInput("");
  };
  const backup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(links.map((l) => l.url), null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "signal-x-links.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <dialog ref={dialog} className="reader-dialog" aria-labelledby="x-heading" onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-zinc-200 p-5 dark:border-zinc-800"><div><p className="reader-eyebrow">Optional · external content</p><h2 id="x-heading" className="mt-1 text-xl font-semibold">X reading panel</h2></div><button className="action-button" aria-label="Close X panel" onClick={onClose}>✕</button></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">Keep a public list, profile, or post close by. Embeds are provided by X and may require sign-in or stop working. Signal does not discover, rank, or search these posts.</p>
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}><input type="url" required maxLength={500} className="reader-input min-w-0 flex-1" aria-label="Public X URL" placeholder="https://x.com/i/lists/…" value={input} onChange={(e) => setInput(e.target.value)} /><button className="action-button">Save link</button></form>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">Nothing is requested from X until you choose Load embed. Loading shares your request with X.</p>
        {message && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{message}</p>}
        <div className="mt-4 space-y-3">{links.map((link) => <div key={link.url} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="break-all text-sm">{link.url}</p><div className="mt-2 flex flex-wrap gap-2">
            <button className="action-button" onClick={() => { setMessage("Loading from X…"); setActive({ ...link }); }}>Load embed</button>
            <a className="action-button" href={link.url} target="_blank" rel="noopener noreferrer">Open on X ↗</a>
            <button className="action-button" onClick={() => { persist(links.filter((l) => l.url !== link.url)); if (active?.url === link.url) setActive(null); }}>Remove link</button>
          </div></div>)}</div>
        {!!links.length && <button className="action-button mt-3" onClick={backup}>Export X links</button>}
        {active && <div className="mt-4"><a href={active.url} target="_blank" rel="noopener noreferrer" className="text-sm underline">Open on X ↗</a><div className="mt-2 min-h-20" ref={host} /></div>}
      </div>
    </div>
  </dialog>;
}
