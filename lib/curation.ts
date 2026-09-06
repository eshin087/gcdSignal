import { AI_TERMS, CATEGORIES, CATEGORY_IDS } from "./categories";
import { keywordMatcher, makeMatcher } from "./fetch-helpers";
import type { CategoryId, Curation, FeedItem, Prefs } from "./types";

const TOPICS: Record<Exclude<CategoryId, "trending">, string[]> = {
  development: ["inference", "fine-tun", "framework", "sdk", "ollama", "vllm", "gguf", "quantization", "deployment", "rag", "mcp", "embedding", "api", "local model"],
  security: ["prompt injection", "jailbreak", "vulnerab", "exploit", "malware", "adversarial", "security", "privacy", "guardrail", "attack", "safety"],
  vibecoding: ["claude code", "codex", "cursor", "copilot", "vibe cod", "coding agent", "code generation", "coding assistant"],
  research: ["research", "paper", "arxiv", "benchmark", "dataset", "training", "reasoning", "study", "evaluation"],
  industry: ["funding", "acquisition", "partnership", "regulation", "lawsuit", "investment", "revenue", "ipo", "valuation"],
};
const topicMatchers = Object.entries(TOPICS).map(([id, terms]) => [id as CategoryId, makeMatcher(terms)] as const);
const release = keywordMatcher(["release", "launch", "introduc", "announc", "rolls out", "now available", "adds support"]);
const tutorial = keywordMatcher(["tutorial", "how to", "guide", "walkthrough", "getting started", "implementation", "step-by-step"]);
const tooling = keywordMatcher(["open-source", "open source", "sdk", "framework", "library", "repository", "cli", "plugin"]);
const technical = keywordMatcher([...TOPICS.development, "debug", "latency", "throughput", "reproduc", "implementation", "architecture"]);

const reasonMatchers = [...new Set([...AI_TERMS, ...Object.values(TOPICS).flat()])].map((term) => [term, keywordMatcher([term])] as const);

/** Explainable metadata from feed text only; labels express rules, not fact checking. */
export function classify(item: FeedItem): Curation {
  const title = item.title;
  const body = item.excerpt ?? "";
  const topics = topicMatchers.filter(([, match]) => match(title, body)).map(([id]) => id);
  if (item.source === "papers" && !topics.includes("research")) topics.push("research");
  if (item.source === "github" && !topics.includes("development")) topics.push("development");
  const kind = item.source === "papers" ? "Research"
    : topics.includes("security") ? "Security"
    : tutorial(title) ? "Tutorial"
    : release(title) ? "Release"
    : item.source === "github" || tooling(title) ? "Tool"
    : topics.includes("research") ? "Research"
    : technical(`${title} ${body}`) ? "Discussion" : "Commentary";
  const matched = reasonMatchers.filter(([, matches]) => matches(`${title} ${body}`)).slice(0, 5).map(([term]) => term);
  return {
    kind, topics,
    builder: kind !== "Commentary" || (item.source === "rss" && topics.includes("industry")),
    reasons: [
      ...(matched.length ? [`Matched: ${matched.join(", ")}`] : [`Source: ${item.sourceMeta ?? item.source}`]),
      ...(topics.length ? [`Topics: ${topics.map((t) => CATEGORIES[t].label).join(", ")}`] : []),
    ],
  };
}

export function authorKey(item: FeedItem): string {
  return item.author ? `${item.source}:${item.author.toLowerCase()}` : "";
}

export function outletKey(item: FeedItem): string {
  if (item.sourceMeta && ["reddit", "youtube"].includes(item.source)) return `${item.source}:${item.sourceMeta.toLowerCase()}`;
  try { return new URL(item.externalUrl ?? item.url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return item.source; }
}

export function isMuted(item: FeedItem, prefs: Pick<Prefs, "mutedAuthors" | "mutedOutlets">): boolean {
  return prefs.mutedAuthors.includes(authorKey(item)) || prefs.mutedOutlets.includes(outletKey(item));
}

/** Broad is a deliberate escape hatch; custom feeds keep their explicit scope. */
export function selectItems(items: FeedItem[], prefs: Pick<Prefs, "contentMode" | "mutedAuthors" | "mutedOutlets">, category: CategoryId, custom = false): FeedItem[] {
  return items.filter((item) => {
    if (isMuted(item, prefs)) return false;
    if (custom || prefs.contentMode === "broad") return true;
    const meta = item.curation ?? classify(item);
    return meta.builder && (category === "trending" || meta.topics.includes(category));
  });
}

export const FOLLOWABLE_TOPICS = CATEGORY_IDS.filter((id) => id !== "trending");
