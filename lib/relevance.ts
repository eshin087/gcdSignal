import { AI_TERMS } from "./categories";
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

/** Terms that identify AI content beyond the baseline AI_TERMS. Generic words
 *  that collide with other tech ("cursor", "inference", "transformer",
 *  "benchmark", "alignment", "flux", "whisper") are deliberately excluded or
 *  qualified — the gate runs in strict title-only mode on HN and Bluesky. */
const EXTRA_TERMS = [
  // products & models
  "chatgpt", "llms", "gpt-4", "gpt-5", "gpt-6", "sora", "veo", "kimi", "qwen",
  "stable diffusion", "dall-e", "imagen", "copilot", "codex", "claude code",
  "cursor ai", "windsurf", "notebooklm", "gemini cli", "openclaw",
  // labs & companies (AI-native only)
  "openai", "anthropic", "deepmind", "meta ai", "xai", "huggingface",
  "hugging face", "perplexity", "elevenlabs", "scale ai", "character ai",
  "stability ai", "moonshot ai",
  // agents & tooling
  "agentic", "ai agent", "ai agents", "coding agent", "llm agent", "multi-agent",
  "mcp", "rag", "retrieval-augmented", "rlhf", "embeddings", "vector database",
  "vector db", "prompt engineering", "prompt injection", "system prompt",
  "hallucinat", "vibe coding", "vibe-cod",
  // models & techniques
  "diffusion model", "multimodal", "context window", "foundation model",
  "frontier model", "language model", "reasoning model", "vision-language",
  "vision language", "neural network", "reinforcement learning", "pretraining",
  "training run", "text-to-video", "text-to-image", "image generation",
  "video generation", "ai model", "ai models", "ai-generated", "ai generated",
  // safety & policy
  "superintelligence", "agi", "ai alignment", "superalignment", "ai safety",
  "ai regulation", "ai act",
  // hardware in an AI context
  "tpu", "gpu cluster", "inference chip", "ai chip", "ai datacenter",
  "ai data center",
];

export const AI_LEXICON: string[] = [...new Set([...AI_TERMS, ...EXTRA_TERMS])];

const titleHit = keywordMatcher(AI_LEXICON);
const balancedHit = makeMatcher(AI_LEXICON);

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

/** A column never empties because the lexicon missed a phrasing — below this
 *  many survivors the gate loosens one notch and re-runs. */
const MIN_ITEMS = 5;

const LOOSER: Record<GatePolicy, GatePolicy> = {
  strict: "balanced",
  balanced: "open",
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
  if (policy === "strict") return titleHit(item.title);
  return balancedHit(item.title, item.excerpt ?? "");
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
  if (custom || !items.length) return items;
  let step = 0;
  for (;;) {
    const gated = items.filter((it) => {
      let policy = policyFor(source, it.sourceMeta);
      for (let i = 0; i < step; i++) policy = LOOSER[policy];
      return passes(it, policy);
    });
    if (gated.length >= MIN_ITEMS || step >= 2) return gated;
    step++;
  }
}
