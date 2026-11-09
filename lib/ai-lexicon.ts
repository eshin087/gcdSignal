import { AI_TERMS } from "./categories";

/** Terms that identify AI content beyond the baseline AI_TERMS. Generic words
 *  that collide with other tech ("cursor", "inference", "transformer",
 *  "benchmark", "alignment", "flux", "whisper", "robot" as in robots.txt) are
 *  deliberately excluded or qualified — the gate runs in strict title-only mode
 *  on Hacker News, Bluesky and whole-site feeds. */
export const EXTRA_TERMS = [
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
  "tpu", "gpu cluster", "gpu cloud", "neocloud", "hbm", "inference chip",
  "ai chip", "ai datacenter", "ai data center",
  // robotics & embodied AI
  "humanoid", "robotics", "robotaxi", "robot learning", "self-driving",
  "autonomous vehicle", "autonomous driving", "world model",
  "vision-language-action",
];

/** Names that also mean something else. They count only with model context;
 *  relevance.ts owns those contextual rules. */
export const AMBIGUOUS = new Set(["claude", "gemini", "llama", "mistral", "grok", "neural", "diffusion", "transformer"]);

/** Unambiguous terms: one headline match establishes AI relevance. */
export const AI_LEXICON: string[] = [...new Set([...AI_TERMS, ...EXTRA_TERMS])].filter((term) => !AMBIGUOUS.has(term));

/**
 * Wide prefilter for whole-site feeds: every term, ambiguous names and
 * context-dependent ones included. It only decides which stories reach an
 * outlet's item cap; the relevance gate still makes the final call.
 */
export const AI_PREFILTER_TERMS: string[] = [...new Set([...AI_TERMS, ...EXTRA_TERMS, "nvidia"])];
