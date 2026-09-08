import { AI_TERMS, CATEGORIES, CATEGORY_IDS } from "./categories";
import { keywordMatcher } from "./fetch-helpers";
import type { CategoryId, Curation, FeedItem, Prefs } from "./types";

const TOPICS: Record<Exclude<CategoryId, "trending">, string[]> = {
  development: ["inference", "fine-tun", "framework", "sdk", "ollama", "vllm", "gguf", "quantization", "deployment", "rag", "mcp", "embedding", "api", "local model"],
  security: ["prompt injection", "jailbreak", "vulnerab", "exploit", "malware", "adversarial", "security", "privacy", "guardrail", "attack", "safety", "breach", "deepfake"],
  vibecoding: ["claude code", "codex", "cursor", "copilot", "vibe cod", "coding agent", "code generation", "coding assistant"],
  research: ["research", "paper", "arxiv", "benchmark", "dataset", "training", "reasoning", "study", "evaluation", "scientist", "clinical trial", "experiment"],
  industry: ["funding", "acquisition", "partnership", "regulation", "lawsuit", "investment", "revenue", "ipo", "valuation", "compute deal", "compute contract", "market share", "web traffic", "data center", "datacenter", "outage", "pricing", "employment", "jobs", "worker", "layoff"],
};
const topicMatchers = Object.entries(TOPICS).map(([id, terms]) => [id as CategoryId, keywordMatcher(terms)] as const);
const release = keywordMatcher(["release", "launch", "introduc", "announc", "rolls out", "now available", "adds support"]);
const featureUpdate = /\b(?:adds?|gains?)\b.{0,45}\b(?:support|capabilit\w*|tracing|integration|feature|context window)\b/i;
const tutorial = keywordMatcher(["tutorial", "how to", "guide", "walkthrough", "getting started", "implementation", "step-by-step"]);
const tooling = keywordMatcher(["open-source", "open source", "sdk", "framework", "library", "repository", "cli", "plugin"]);
const technical = keywordMatcher([...TOPICS.development, "debug", "latency", "throughput", "reproduc", "implementation", "architecture"]);
const news = keywordMatcher(["outage", "banned", "ban ", "court", "lawsuit", "compute", "contract", "trial", "data center", "datacenter", "acquisition", "funding", "partnership", "regulation", "pricing", "price cut", "layoff", "agreement", "deal", "market share"]);
const commentary = /\b(?:how i feel|my thoughts|what i think|why i (?:love|hate)|is a (?:freak|beast)|insane|mind[- ]blowing)\b/i;
const promotion = /\b(?:thanks? (?:to|you to) (?:our |the )?sponsor|(?:our |this (?:video|post)(?: is)? )?sponsor(?:ed)?(?: by)?|affiliate links?|use (?:my |our )?code|paid (?:partnership|promotion))\b/i;
const primaryDomains = ["openai.com", "anthropic.com", "deepmind.google", "blog.google", "research.google", "microsoft.com", "huggingface.co", "ai.meta.com", "mistral.ai", "arxiv.org"];
const primaryChannels = new Set(["openai", "anthropic", "google deepmind", "google", "microsoft", "hugging face"]);

/** Only the editorial prefix; sponsor copy and links must not set relevance/topics. */
export function editorialText(text: string): string {
  const match = promotion.exec(text);
  return (match ? text.slice(0, match.index) : text).replace(/https?:\/\/\S+/g, " ").trim();
}

export function isPrimarySource(item: FeedItem): boolean {
  if (item.source === "papers") return true;
  if (item.source === "youtube") return primaryChannels.has((item.author ?? item.sourceMeta ?? "").trim().toLowerCase());
  try {
    const host = new URL(item.externalUrl ?? item.url).hostname.toLowerCase();
    return primaryDomains.some((domain) => host === domain || host.endsWith("." + domain));
  } catch { return false; }
}

const reasonMatchers = [...new Set([...AI_TERMS, ...Object.values(TOPICS).flat()])].map((term) => [term, keywordMatcher([term])] as const);

/** Explainable labels use publisher text, not generated claims or fact checking. */
export function classify(item: FeedItem): Curation {
  const title = editorialText(item.title);
  const body = editorialText(item.excerpt ?? "");
  let articlePath = "";
  try { articlePath = decodeURIComponent(new URL(item.externalUrl ?? item.url).pathname).replace(/[-_/]/g, " "); } catch { /* text labels still work */ }
  const text = title + " " + body + " " + articlePath;
  // Relevance is a separate gate. Once AI relevance is known, a single explicit
  // topic mention in the editorial excerpt is useful evidence (e.g. a study).
  const topics = topicMatchers.filter(([, match]) => match(text)).map(([id]) => id);
  const laborStory = /\b(?:jobs|workers?|employment|layoffs?)\b/i.test(text);
  if (laborStory && !/\b(?:paper|study|arxiv|benchmark|experiment|evaluation)\b/i.test(text)) {
    const research = topics.indexOf("research");
    if (research >= 0) topics.splice(research, 1);
  }
  if (item.source === "papers" && !topics.includes("research")) topics.push("research");
  if (item.source === "github" && !topics.includes("development")) topics.push("development");
  const primary = isPrimarySource(item);
  const sponsored = /^\s*(?:sponsored|advertisement|advertorial|partner content|paid partnership)\b/i.test(item.title);
  const kind = item.source === "papers" ? "Research"
    : commentary.test(title) ? "Commentary"
    : tutorial(title) ? "Tutorial"
    : topics.includes("security") ? "Security"
    : release(title) || featureUpdate.test(title) ? "Release"
    : item.source === "github" || tooling(title) ? "Tool"
    : topics.includes("research") ? "Research"
    : topics.includes("industry") || news(text) ? "News"
    : technical(text) ? "Discussion" : "Commentary";
  const matched = reasonMatchers.filter(([, matches]) => matches(text)).slice(0, 5).map(([term]) => term);
  return {
    kind, topics, primary, sponsored,
    substantive: !sponsored && ["News", "Release", "Research", "Security"].includes(kind),
    builder: ["Release", "Tool", "Tutorial", "Research", "Security", "Discussion"].includes(kind),
    reasons: [
      ...(primary ? ["Primary source"] : []),
      ...(matched.length ? ["Matched: " + matched.join(", ")] : ["Source: " + (item.sourceMeta ?? item.source)]),
      ...(topics.length ? ["Topics: " + topics.map((t) => CATEGORIES[t].label).join(", ")] : []),
      ...(sponsored ? ["Sponsored headline"] : []),
    ],
  };
}

export function authorKey(item: FeedItem): string {
  // Cached/provider data is an external boundary even when the TS shape says string.
  return typeof item.author === "string" && item.author ? item.source + ":" + item.author.toLowerCase() : "";
}

export function outletKey(item: FeedItem): string {
  if (item.sourceMeta && ["reddit", "youtube"].includes(item.source)) return item.source + ":" + item.sourceMeta.toLowerCase();
  try { return new URL(item.externalUrl ?? item.url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return item.source; }
}

export function isMuted(item: FeedItem, prefs: Pick<Prefs, "mutedAuthors" | "mutedOutlets">): boolean {
  return prefs.mutedAuthors.includes(authorKey(item)) || prefs.mutedOutlets.includes(outletKey(item));
}

/** All AI removes only the optional Builder filter, never the selected topic. */
export function selectItems(items: FeedItem[], prefs: Pick<Prefs, "contentMode" | "mutedAuthors" | "mutedOutlets">, category: CategoryId, custom = false): FeedItem[] {
  return items.filter((item) => {
    if (isMuted(item, prefs)) return false;
    if (custom) return true;
    // Recompute legacy cached labels so older rules cannot keep hiding stories.
    const meta = classify(item);
    return (category === "trending" || meta.topics.includes(category))
      && (prefs.contentMode !== "builder" || meta.builder);
  });
}

export const FOLLOWABLE_TOPICS = CATEGORY_IDS.filter((id) => id !== "trending");
