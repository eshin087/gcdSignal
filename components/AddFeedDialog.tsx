"use client";

import { useState } from "react";
import type { CustomFeed, SourceId } from "@/lib/types";
import Modal from "./Modal";

const INPUT_CLS =
  "w-full rounded border border-black/10 bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-zinc-400 focus:border-indigo-500/60 dark:border-white/15 dark:placeholder:text-zinc-600";

const SOURCE_OPTIONS: Array<{ id: SourceId; label: string }> = [
  { id: "reddit", label: "Subreddit" },
  { id: "rss", label: "RSS / news site" },
  { id: "hackernews", label: "Hacker News search" },
  { id: "bluesky", label: "Bluesky search" },
  { id: "mastodon", label: "Mastodon hashtag" },
  { id: "fourchan", label: "4chan board" },
];

const FIELD_META: Record<SourceId, { label: string; placeholder: string }> = {
  reddit: { label: "Subreddit (joins with + allowed)", placeholder: "StableDiffusion or ai+robotics" },
  rss: { label: "Feed URL", placeholder: "https://example.com/feed.xml" },
  hackernews: { label: "Search query", placeholder: "AI agents" },
  bluesky: { label: "Search query", placeholder: "AI agents" },
  mastodon: { label: "Hashtag (without #)", placeholder: "generativeai" },
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
    case "hackernews": {
      if (v.length > 100) return { error: "Query too long" };
      return { feed: { source, label: `HN: ${v}`, params: { q: v } } };
    }
    case "bluesky": {
      if (v.length > 100) return { error: "Query too long" };
      return { feed: { source, label: `Bsky: ${v}`, params: { q: v } } };
    }
    case "mastodon": {
      const tag = v.replace(/^#/, "");
      if (!/^[A-Za-z0-9_]{1,64}$/.test(tag)) return { error: "Invalid hashtag" };
      const instance = extra.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      if (instance && !/^[a-z0-9.-]{3,100}$/i.test(instance)) return { error: "Invalid instance" };
      return {
        feed: {
          source,
          label: instance ? `#${tag}@${instance}` : `#${tag}`,
          params: { tag, ...(instance ? { instance } : {}) },
        },
      };
    }
    case "fourchan": {
      const board = v.replace(/\//g, "").toLowerCase();
      if (!/^[a-z0-9]{1,10}$/.test(board)) return { error: "Invalid board" };
      const kw = extra.trim();
      return {
        feed: { source, label: `/${board}/`, params: { board, ...(kw ? { q: kw } : {}) } },
      };
    }
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
      const data = (await res.json()) as { items?: unknown[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onAdd({ ...built.feed, id: `custom:${Date.now().toString(36)}` });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Feed test failed");
      setTesting(false);
    }
  };

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
            className={INPUT_CLS}
          >
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-zinc-500">{FIELD_META[source].label}</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={FIELD_META[source].placeholder}
            className={INPUT_CLS}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>

        {source === "mastodon" && (
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-500">Instance (optional)</span>
            <input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="mastodon.social"
              className={INPUT_CLS}
            />
          </label>
        )}
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
          className="w-full rounded bg-indigo-500 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
        >
          {testing ? "Testing feed…" : "Test & add"}
        </button>
      </div>
    </Modal>
  );
}
