import { AI_LEXICON } from "./ai-lexicon";
import { classify, editorialText, isPrimarySource } from "./curation";
import { keywordMatcher, makeMatcher } from "./fetch-helpers";
import { isSiteWideOutlet } from "./sources/rss";
import type { FeedItem, SourceId } from "./types";

/**
 * Universal AI-relevance gate, applied centrally to every built-in feed
 * response. Policies are source-aware: sources that are AI by construction
 * (papers, gated 4chan) pass untouched; general-purpose search sources
 * (Hacker News, Bluesky, GitHub) must mention AI in the title; AI-scoped
 * outlets and subs get the balanced title-or-two-body-hits rule.
 *
 * Audit that motivated this (2026-09-05, 1,204 live items): 7.4% off-topic
 * overall — HN 14.4% (Algolia prefix-matched "AI" to "Airbus"), YouTube
 * search bypassed every keyword filter, GitHub `q=ai` matched "airgeddon",
 * and the Trending news column had no filter at all.
 */

export type GatePolicy = "strict" | "balanced" | "open";

const titleHit = keywordMatcher(AI_LEXICON);
const balancedHit = makeMatcher(AI_LEXICON);
const modelName = /\b(?:claude|gemini|llama|mistral|grok|qwen|gpt)[- ]?(?:\d|(?:opus|sonnet|haiku|astra)\b)/i;
const ambiguousBrand = /\b(?:claude|gemini|llama|mistral|grok|transformer)\b/i;
const modelContext = /\b(?:model|chatbot|assistant|token|inference|weights|prompt|llm|ai|neural|context window)\b/i;
/** "Claude" alone is the assistant ("Goodbye Claude, hello Pi") unless it is part
 *  of a well-known person's name. Other ambiguous names still need model context. */
const claudeAssistant = /(?<!\bjean[- ])\bclaude\b(?!\s+(?:monet|shannon|debussy|l[ée]vi|van damme|rains|chabrol|lelouch|bernard|cahun|lorrain|makelele|puel|juncker|berrou|frollo|giroux|julien)\b)/i;
/** Nvidia is AI-industry news unless the story is about graphics cards or drivers. */
const nvidia = /\bnvidia\b/i;
const consumerGpu = /\b(?:geforce|rtx|gtx|dlss|shield|gaming|gamers?|drivers?)\b/i;
const contextualHit = (text: string) => modelName.test(text) || claudeAssistant.test(text)
  || (ambiguousBrand.test(text) && modelContext.test(text)) || (nvidia.test(text) && !consumerGpu.test(text));

/** Subreddits where nearly everything is AI by construction. */
const AI_NATIVE_SUBS = new Set(
  [
    "artificial", "singularity", "openai", "claudeai", "localllama",
    "machinelearning", "llmdevs", "huggingface", "ollama", "mlops",
    "vibecoding", "chatgptcoding", "cursor", "githubcopilot",
    "chatgptjailbreak", "artificialinteligence", "mlscaling",
    "reinforcementlearning", "stablediffusion", "chatgpt", "bard", "geminiai",
    "deepseek", "midjourney", "aivideo",
  ].map((s) => s.toLowerCase())
);

/** Sparse strict sources may admit two body hits, but never bypass AI relevance. */
const MIN_ITEMS = 5;

const LOOSER: Record<GatePolicy, GatePolicy> = {
  strict: "balanced",
  balanced: "balanced",
  open: "open",
};

export function policyFor(source: SourceId, sourceMeta?: string): GatePolicy {
  switch (source) {
    case "papers":
    case "fourchan":
      return "open";
    case "hackernews":
    case "bluesky":
      return "strict";
    // Repo names rarely carry AI words ("vllm-project/vllm"); descriptions do.
    case "github":
    case "youtube":
      return "balanced";
    case "reddit": {
      const sub = (sourceMeta ?? "").replace(/^r\//i, "").toLowerCase();
      return AI_NATIVE_SUBS.has(sub) ? "balanced" : "strict";
    }
    case "rss":
      return isSiteWideOutlet(sourceMeta ?? "") ? "strict" : "balanced";
  }
}

function passes(item: FeedItem, policy: GatePolicy): boolean {
  if (policy === "open") return true;
  const title = editorialText(item.title), body = editorialText(item.excerpt ?? "");
  // AI-native primary announcements can introduce a model name the lexicon
  // has never seen. Microsoft is excluded here because its site is broader.
  if (isPrimarySource(item)) {
    try {
      const host = new URL(item.externalUrl ?? item.url).hostname;
      if (/^(?:www\.)?(?:openai\.com|anthropic\.com|deepmind\.google|mistral\.ai|huggingface\.co)$/.test(host)) return true;
    } catch { /* textual relevance remains available */ }
  }
  if (titleHit(title) || contextualHit(title)) return true;
  if (policy === "strict") return false;
  return balancedHit("", body) || contextualHit(body);
}

/**
 * Filter a built-in feed's items by the source-aware policy. Custom feeds are
 * exempt — the user chose them deliberately.
 */
export function applyRelevance(
  source: SourceId,
  items: FeedItem[],
  { custom = false }: { custom?: boolean } = {}
): FeedItem[] {
  // Label only what survives: a broad pool (Hacker News) is mostly off-topic.
  const labeled = (list: FeedItem[]) => list.map((item) => ({ ...item, curation: classify(item) }));
  if (custom || !items.length) return labeled(items);
  let step = 0;
  for (;;) {
    const gated = items.filter((it) => {
      let policy = policyFor(source, it.sourceMeta);
      for (let i = 0; i < step; i++) policy = LOOSER[policy];
      return passes(it, policy);
    });
    if (gated.length >= MIN_ITEMS || step >= 1) return labeled(gated);
    step++;
  }
}
