import type { CategoryId, SourceId } from "./types";

export interface CategoryDef {
  label: string;
  reddit: { subs: string };
  hackernews: { q: string };
  bluesky: { q: string };
  mastodon: { tags: string[] };
  fourchan: { board: string; keywords: string[] };
  rss: { keywords: string[] };
}

export const CATEGORIES: Record<CategoryId, CategoryDef> = {
  trending: {
    label: "Trending",
    reddit: { subs: "artificial+singularity+OpenAI+ClaudeAI+LocalLLaMA+MachineLearning" },
    hackernews: { q: "AI" },
    bluesky: { q: "AI" },
    mastodon: { tags: ["ai", "artificialintelligence", "llm"] },
    fourchan: {
      board: "g",
      keywords: [
        "ai", "llm", "lmg", "aicg", "ldg", "sdg", "gpt", "claude", "gemini",
        "deepseek", "openai", "anthropic", "stable diffusion", "chatbot",
      ],
    },
    rss: { keywords: [] },
  },
  development: {
    label: "Development",
    reddit: { subs: "LocalLLaMA+LLMDevs+huggingface+ollama+mlops" },
    hackernews: { q: "LLM" },
    bluesky: { q: "LLM" },
    mastodon: { tags: ["llm", "machinelearning"] },
    fourchan: {
      board: "g",
      keywords: ["lmg", "llama", "ollama", "local model", "gguf", "quant", "fine-tun", "inference", "vllm"],
    },
    rss: { keywords: ["model", "open source", "open-source", "api", "developer", "agent", "release", "llm"] },
  },
  security: {
    label: "Security",
    reddit: { subs: "netsec+cybersecurity+ChatGPTJailbreak" },
    hackernews: { q: "AI security" },
    bluesky: { q: "AI security" },
    mastodon: { tags: ["infosec", "cybersecurity", "aisecurity"] },
    fourchan: {
      board: "g",
      keywords: ["jailbreak", "prompt injection", "exploit", "malware", "vulnerabilit", "security", "leak"],
    },
    rss: { keywords: ["security", "vulnerability", "jailbreak", "breach", "exploit", "injection", "safety", "privacy"] },
  },
  vibecoding: {
    label: "Vibe Coding",
    reddit: { subs: "vibecoding+ChatGPTCoding+cursor+ClaudeAI+GithubCopilot" },
    hackernews: { q: "vibe coding" },
    bluesky: { q: "vibe coding" },
    mastodon: { tags: ["vibecoding", "aicoding", "copilot"] },
    fourchan: {
      board: "g",
      keywords: ["cursor", "copilot", "claude code", "codex", "vibe cod", "agentic", "coding"],
    },
    rss: { keywords: ["coding", "copilot", "cursor", "claude code", "codex", "ide", "programming", "developer"] },
  },
  research: {
    label: "Research",
    reddit: { subs: "MachineLearning+mlscaling+reinforcementlearning" },
    hackernews: { q: "AI research" },
    bluesky: { q: "arxiv" },
    mastodon: { tags: ["machinelearning", "airesearch", "arxiv"] },
    fourchan: {
      board: "g",
      keywords: ["paper", "arxiv", "benchmark", "sota", "research", "training"],
    },
    rss: { keywords: ["research", "paper", "study", "benchmark", "arxiv", "breakthrough"] },
  },
  industry: {
    label: "Industry",
    // Note: the real subreddit name is spelled with one 'l'.
    reddit: { subs: "ArtificialInteligence+OpenAI+singularity+technology" },
    hackernews: { q: "AI startup" },
    bluesky: { q: "OpenAI" },
    mastodon: { tags: ["ai", "technology", "openai"] },
    fourchan: {
      board: "g",
      keywords: ["openai", "anthropic", "google", "meta", "nvidia", "altman", "funding", "lawsuit", "microsoft", "xai"],
    },
    rss: {
      keywords: [
        "funding", "acquisition", "launch", "partnership", "lawsuit", "regulation",
        "revenue", "valuation", "openai", "anthropic", "nvidia",
      ],
    },
  },
};

export const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];

export function isCategoryId(v: string | null): v is CategoryId {
  return v !== null && v in CATEGORIES;
}

/**
 * Merge category defaults with explicit query params (explicit wins field-by-field).
 * Custom feeds always send explicit params, so they are category-independent.
 * Returns the flat string params consumed by the SOURCES registry.
 */
export function resolveParams(
  source: SourceId,
  category: CategoryId,
  sp: URLSearchParams
): Record<string, string> {
  const def = CATEGORIES[category];
  switch (source) {
    case "reddit":
      return { subs: sp.get("sub") ?? def.reddit.subs };
    case "hackernews":
      return { q: sp.get("q") ?? def.hackernews.q };
    case "bluesky":
      return { q: sp.get("q") ?? def.bluesky.q };
    case "mastodon":
      return {
        tags: sp.get("tag") ?? def.mastodon.tags.join(","),
        instance: sp.get("instance") ?? "mastodon.social",
      };
    case "fourchan": {
      const board = sp.get("board");
      // Custom boards get no default AI keyword filter (top threads by replies)
      // unless the custom feed provides its own comma-separated `q` keywords.
      if (board) return { board, keywords: sp.get("q") ?? "" };
      return { board: def.fourchan.board, keywords: def.fourchan.keywords.join(",") };
    }
    case "rss": {
      const url = sp.get("url");
      // A custom RSS feed is shown unfiltered; the curated bundle gets category keywords.
      if (url) return { url, keywords: "" };
      return { url: "", keywords: def.rss.keywords.join(",") };
    }
  }
}
