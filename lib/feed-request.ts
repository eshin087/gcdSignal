import { CATEGORY_IDS, resolveParams } from "./categories";
import { validateFeedUrl } from "./safe-fetch";
import type { CategoryId, SourceId } from "./types";

const CUSTOM_KEYS: Record<SourceId, string[]> = {
  reddit: ["sub"], rss: ["url"], youtube: ["channel"], hackernews: ["q"],
  bluesky: ["q"], github: ["q"], fourchan: ["board", "q"], papers: [],
};

/** Canonicalize before cache lookup; unknown parameters cannot disable AI gates. */
export function parseFeedRequest(source: SourceId, input: URLSearchParams) {
  const categoryInput = input.get("category") ?? "trending";
  if (!CATEGORY_IDS.includes(categoryInput as CategoryId)) throw new Error("Invalid category");
  const category = categoryInput as CategoryId;
  const normalized = new URLSearchParams({ category });
  for (const key of ["category", ...CUSTOM_KEYS[source]]) {
    if (input.getAll(key).length > 1) throw new Error("Duplicate feed parameter");
  }
  for (const key of CUSTOM_KEYS[source]) {
    let value = input.get(key);
    if (value === null) continue;
    value = value.trim();
    if (key === "sub" && !/^[A-Za-z0-9_+]{1,160}$/.test(value)) throw new Error("Invalid subreddit");
    if (key === "board" && !/^[a-z0-9]{1,10}$/.test(value)) throw new Error("Invalid board");
    if (key === "channel" && !/^(UC|UU)[A-Za-z0-9_-]{10,40}$/.test(value)) throw new Error("Invalid channel");
    if (key === "q" && (value.length < 1 || value.length > 100)) throw new Error("Invalid query");
    if (key === "url") value = validateFeedUrl(value).toString();
    if (key === "q") value = value.replace(/\s+/g, " ");
    if (key === "sub") value = value.toLowerCase();
    normalized.set(key, value);
  }
  normalized.sort();
  const custom = CUSTOM_KEYS[source].some((key) => normalized.has(key));
  return { category, custom, canonicalQuery: normalized.toString(), params: resolveParams(source, category, normalized) };
}
