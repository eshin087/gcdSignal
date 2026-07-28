"use client";

import { useState } from "react";
import type { CustomFeed, SourceId } from "@/lib/types";
import Modal from "./Modal";

const INPUT_CLS =
  "w-full rounded-lg border border-black/10 bg-black/[0.02] px-2.5 py-1.5 text-sm outline-none placeholder:text-zinc-400 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20 dark:border-white/15 dark:bg-white/[0.03] dark:placeholder:text-zinc-600";

const SOURCE_OPTIONS: Array<{ id: SourceId; label: string }> = [
  { id: "reddit", label: "Subreddit" },
  { id: "rss", label: "RSS / news site" },
  { id: "youtube", label: "YouTube channel" },
  { id: "github", label: "GitHub search" },
  { id: "hackernews", label: "Hacker News search" },
  { id: "bluesky", label: "Bluesky search" },
  { id: "fourchan", label: "4chan board" },
];

const FIELD_META: Partial<Record<SourceId, { label: string; placeholder: string }>> = {
  reddit: { label: "Subreddit (joins with + allowed)", placeholder: "StableDiffusion or ai+robotics" },
  rss: { label: "Feed URL", placeholder: "https://example.com/feed.xml" },
  youtube: { label: "Channel ID or channel URL", placeholder: "UCXUPKJO5MZQN11PqgIvyuvQ" },
  github: { label: "Search query or topic", placeholder: "llm agents" },
  hackernews: { label: "Search query", placeholder: "AI agents" },
  bluesky: { label: "Search query", placeholder: "AI agents" },
  fourchan: { label: "Board (without slashes)", placeholder: "g" },
};

function buildFeed(
  source: SourceId,
  value: string,
  extra: string
): { feed?: Omit<CustomFeed, "id">; error?: string } {
  const v = value.trim();
  if (!v) return { error: "Required field is empty" };
  switch (source) {
    case "reddit": {
      const sub = v.replace(/^\/?r\//i, "");
      if (!/^[A-Za-z0-9_]{2,21}(\+[A-Za-z0-9_]{2,21})*$/.test(sub)) {
        return { error: "Invalid subreddit name" };
      }
      return { feed: { source, label: `r/${sub}`, params: { sub } } };
    }
    case "rss": {
      let parsed: URL;
      try {
        parsed = new URL(v);
      } catch {
        return { error: "Not a valid URL" };
      }
      if (!/^https?:$/.test(parsed.protocol)) return { error: "URL must be http(s)" };
      return { feed: { source, label: parsed.hostname.replace(/^www\./, ""), params: { url: v } } };
    }
    case "youtube": {
      const id = /(U[CU][A-Za-z0-9_-]{10,40})/.exec(v)?.[1];
      if (!id) {
        return { error: "Paste a channel ID (starts with UC) or a URL containing one" };
      }
      return { feed: { source, label: `YouTube: ${id.slice(0, 12)}…`, params: { channel: id } } };
    }
    case "github": {
      if (v.length > 100) return { error: "Query too long" };
      return { feed: { source, label: `GH: ${v}`, params: { q: v } } };
    }
    case "hackernews": {
      if (v.length > 100) return { error: "Query too long" };
      return { feed: { source, label: `HN: ${v}`, params: { q: v } } };
    }
    case "bluesky": {
      if (v.length > 100) return { error: "Query too long" };
      return { feed: { source, label: `Bsky: ${v}`, params: { q: v } } };
    }
    case "fourchan": {
      const board = v.replace(/\//g, "").toLowerCase();
      if (!/^[a-z0-9]{1,10}$/.test(board)) return { error: "Invalid board" };
      const kw = extra.trim();
      return {
        feed: { source, label: `/${board}/`, params: { board, ...(kw ? { q: kw } : {}) } },
      };
    }
    default:
      return { error: "Unsupported source" };
  }
}

export default function AddFeedDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (feed: CustomFeed) => void;
}) {
  const [source, setSource] = useState<SourceId>("reddit");
  const [value, setValue] = useState("");
  const [extra, setExtra] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setValue("");
    setExtra("");
    setError(null);
    setTesting(false);
  };

  const submit = async () => {
    const built = buildFeed(source, value, extra);
    if (!built.feed) {
      setError(built.error ?? "Invalid input");
      return;
    }
    setTesting(true);
    setError(null);
    try {
      const qs = new URLSearchParams(built.feed.params);
      const res = await fetch(`/api/feeds/${source}?${qs}`);
      const data = (await res.json()) as {
        items?: Array<{ sourceMeta?: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      // YouTube custom feeds: replace the opaque channel-id label with the
      // channel's actual name from the test fetch.
      const label =
        source === "youtube" && data.items?.[0]?.sourceMeta
          ? `YT: ${data.items[0].sourceMeta}`
          : built.feed.label;
      onAdd({ ...built.feed, label, id: `custom:${Date.now().toString(36)}` });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Feed test failed");
      setTesting(false);
    }
  };

  const meta = FIELD_META[source] ?? { label: "Value", placeholder: "" };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Add feed"
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-500">Type</span>
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value as SourceId);
              setError(null);
            }}
            // Explicit colors + color-scheme: the OS-rendered option list doesn't
            // inherit the page theme, which left light text on a white popup.
            className={`${INPUT_CLS} text-zinc-900 [color-scheme:light] dark:text-zinc-100 dark:[color-scheme:dark]`}
          >
            {SOURCE_OPTIONS.map((o) => (
              <option
                key={o.id}
                value={o.id}
                className="bg-white text-zinc-900 dark:bg-[#141416] dark:text-zinc-100"
              >
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-zinc-500">{meta.label}</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={meta.placeholder}
            className={INPUT_CLS}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>

        {source === "fourchan" && (
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-500">
              Filter keywords (optional, comma-separated)
            </span>
            <input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="ai, llm, gpt"
              className={INPUT_CLS}
            />
          </label>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          onClick={submit}
          disabled={testing}
          className="w-full rounded-lg bg-cyan-500 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-400 disabled:opacity-50 dark:bg-cyan-400 dark:text-cyan-950 dark:hover:bg-cyan-300"
        >
          {testing ? "Testing feed…" : "Test & add"}
        </button>
      </div>
    </Modal>
  );
}
