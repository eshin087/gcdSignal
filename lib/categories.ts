import type { CategoryId, SourceId } from "./types";

/**
 * Baseline "is this about AI at all" terms — used to gate sources that aren't
 * AI-native (r/technology, r/cybersecurity, /g/ vendor-name matches) so they
 * only contribute AI-relevant posts.
 */
export const AI_TERMS = [
  "ai", "llm", "gpt", "openai", "anthropic", "claude", "gemini", "deepseek",
  "chatbot", "machine learning", "neural", "deep learning",
  "artificial intelligence", "genai", "generative", "copilot", "agentic",
  "diffusion", "transformer", "deepfake", "mistral", "hugging face", "llama",
  "grok", "midjourney",
];

export interface CategoryDef {
  label: string;
  reddit: {
    subs: string;
    /** Subs (lowercase, no r/) whose posts must additionally match gateTerms. */
    gateSubs?: string[];
    gateTerms?: string[];
    /** Optional second gate — e.g. AI subs gated on security terms while
     *  security subs are gated on AI terms. */
    gate2Subs?: string[];
    gate2Terms?: string[];
  };
  hackernews: { q: string };
  bluesky: { q: string };
  fourchan: { board: string; keywords: string[]; aiGate?: boolean };
  /** Title-weighted require list (empty = everything passes). */
  rss: { keywords: string[] };
  youtube: { q: string };
  github: { q: string };
  papers: { keywords: string[] };
  x: { keywords: string[] };
}

export const CATEGORIES: Record<CategoryId, CategoryDef> = {
  trending: {
    label: "Trending",
    reddit: { subs: "artificial+singularity+OpenAI+ClaudeAI+LocalLLaMA+MachineLearning" },
    hackernews: { q: "AI" },
    bluesky: { q: "AI" },
    fourchan: {
      board: "g",
      keywords: [
        "ai", "llm", "lmg", "aicg", "ldg", "sdg", "gpt", "claude", "gemini",
        "deepseek", "openai", "anthropic", "stable diffusion", "chatbot",
      ],
    },
    rss: { keywords: [] },
    youtube: { q: "AI" },
    github: { q: "ai" },
    papers: { keywords: [] },
    x: { keywords: [] },
  },
  development: {
    label: "Development",
    reddit: { subs: "LocalLLaMA+LLMDevs+huggingface+ollama+mlops" },
    hackernews: { q: "LLM" },
    bluesky: { q: "LLM" },
    fourchan: {
      board: "g",
      keywords: ["lmg", "llama", "ollama", "local model", "gguf", "quant", "fine-tun", "inference", "vllm"],
    },
    rss: {
      keywords: [
        "llm", "open source", "open-source", "developer", "framework", "sdk",
        "agent", "fine-tun", "inference", "hugging face", "benchmark",
      ],
    },
    youtube: { q: "LLM development" },
    github: { q: "llm" },
    papers: { keywords: ["llm", "agent", "code", "inference", "efficient"] },
    x: { keywords: ["llm", "open source", "model", "release", "code", "agent", "developer"] },
  },
  security: {
    label: "Security",
    // Two-sided intersection: security subs must mention AI; AI subs must
    // mention security. r/ChatGPTJailbreak is on-topic by construction.
    reddit: {
      subs: "netsec+cybersecurity+ChatGPTJailbreak+artificial+OpenAI+LocalLLaMA+ClaudeAI",
      gateSubs: ["netsec", "cybersecurity"],
      gateTerms: AI_TERMS,
      gate2Subs: ["artificial", "openai", "localllama", "claudeai"],
      gate2Terms: [
        "security", "jailbreak", "prompt injection", "exploit", "vulnerab",
        "leak", "breach", "malware", "attack", "safety", "adversarial", "hack",
        "phishing", "scam", "guardrail", "privacy",
      ],
    },
    hackernews: { q: "AI security" },
    bluesky: { q: "AI security" },
    fourchan: {
      board: "g",
      keywords: ["jailbreak", "prompt injection", "exploit", "malware", "vulnerabilit", "security", "leak"],
      aiGate: true,
    },
    rss: {
      keywords: [
        "security", "vulnerability", "jailbreak", "breach", "exploit",
        "injection", "privacy", "adversarial", "cve", "guardrail", "alignment",
        "red team", "malware", "attack", "safety", "scam", "fraud",
      ],
    },
    youtube: { q: "AI security" },
    github: { q: "ai security" },
    papers: {
      keywords: ["security", "adversarial", "jailbreak", "attack", "safety", "alignment", "robust", "poisoning", "backdoor"],
    },
    x: { keywords: ["security", "jailbreak", "vulnerab", "exploit", "hack", "safety", "adversarial", "injection"] },
  },
  vibecoding: {
    label: "Vibe Coding",
    reddit: {
      subs: "vibecoding+ChatGPTCoding+cursor+ClaudeAI+GithubCopilot",
      gateSubs: ["claudeai"],
      gateTerms: [
        "code", "coding", "program", "dev", "build", "app", "script", "debug",
        "cli", "ide", "agent", "mcp", "terminal", "engineer",
      ],
    },
    hackernews: { q: "vibe coding" },
    bluesky: { q: "vibe coding" },
    fourchan: {
      board: "g",
      keywords: ["cursor", "copilot", "claude code", "codex", "vibe cod", "agentic", "coding"],
    },
    rss: {
      keywords: [
        "copilot", "cursor", "claude code", "codex", "vibe coding", "vibe-cod",
        "coding assistant", "code assistant", "ai coding", "pair program",
        "code generation", "ide",
      ],
    },
    youtube: { q: "vibe coding" },
    github: { q: "coding agent" },
    papers: { keywords: ["code generation", "program synthesis", "software engineer", "coding"] },
    x: { keywords: ["coding", "cursor", "copilot", "claude code", "codex", "vibe", "built", "shipped"] },
  },
  research: {
    label: "Research",
    reddit: { subs: "MachineLearning+mlscaling+reinforcementlearning" },
    hackernews: { q: "AI research" },
    bluesky: { q: "arxiv" },
    fourchan: {
      board: "g",
      keywords: ["paper", "arxiv", "benchmark", "sota", "research", "training"],
      aiGate: true,
    },
    rss: {
      keywords: [
        "research", "paper", "study", "benchmark", "arxiv", "breakthrough",
        "dataset", "scaling", "reasoning", "training",
      ],
    },
    youtube: { q: "AI research paper" },
    github: { q: "machine learning" },
    papers: { keywords: [] },
    x: { keywords: ["paper", "research", "arxiv", "benchmark", "dataset", "training", "reasoning"] },
  },
  industry: {
    label: "Industry",
    // Note: the real subreddit name is spelled with one 'l'.
    reddit: {
      subs: "ArtificialInteligence+OpenAI+singularity+technology",
      gateSubs: ["technology"],
      gateTerms: AI_TERMS,
    },
    hackernews: { q: "AI startup" },
    bluesky: { q: "OpenAI" },
    fourchan: {
      board: "g",
      keywords: ["openai", "anthropic", "google", "meta", "nvidia", "altman", "funding", "lawsuit", "microsoft", "xai"],
      aiGate: true,
    },
    rss: {
      keywords: [
        "funding", "acquisition", "launch", "partnership", "lawsuit",
        "regulation", "revenue", "valuation", "openai", "anthropic", "nvidia",
        "investment", "ipo", "billion", "startup", "antitrust", "chip",
      ],
    },
    youtube: { q: "AI industry news" },
    github: { q: "ai" },
    papers: { keywords: ["efficient", "deployment", "production", "cost"] },
    x: {
      keywords: [
        "openai", "anthropic", "google", "funding", "launch", "announce",
        "release", "valuation", "acquisition", "partnership", "nvidia",
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
    case "reddit": {
      const sub = sp.get("sub");
      if (sub) return { subs: sub }; // custom feeds: no category gates
      return {
        subs: def.reddit.subs,
        gateSubs: (def.reddit.gateSubs ?? []).join(","),
        gateTerms: (def.reddit.gateTerms ?? []).join(","),
        gate2Subs: (def.reddit.gate2Subs ?? []).join(","),
        gate2Terms: (def.reddit.gate2Terms ?? []).join(","),
      };
    }
    case "hackernews":
      return { q: sp.get("q") ?? def.hackernews.q };
    case "bluesky":
      return { q: sp.get("q") ?? def.bluesky.q };
    case "fourchan": {
      const board = sp.get("board");
      // Custom boards get no default AI keyword filter (top threads by replies)
      // unless the custom feed provides its own comma-separated `q` keywords.
      if (board) return { board, keywords: sp.get("q") ?? "", aiGate: "" };
      return {
        board: def.fourchan.board,
        keywords: def.fourchan.keywords.join(","),
        aiGate: def.fourchan.aiGate ? "1" : "",
      };
    }
    case "rss": {
      const url = sp.get("url");
      // A custom RSS feed is shown unfiltered; the curated bundle gets category keywords.
      if (url) return { url, keywords: "" };
      return { url: "", keywords: def.rss.keywords.join(",") };
    }
    case "youtube": {
      const channel = sp.get("channel");
      if (channel) return { channel, q: "" };
      return { channel: "", q: def.youtube.q };
    }
    case "github":
      return { q: sp.get("q") ?? def.github.q };
    case "papers":
      return { keywords: def.papers.keywords.join(",") };
    case "x": {
      const handle = sp.get("handle");
      if (handle) return { handle, keywords: "" };
      return { handle: "", keywords: def.x.keywords.join(",") };
    }
  }
}
