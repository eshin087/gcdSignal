import { AI_TERMS, CATEGORIES, CATEGORY_IDS } from "./categories";
import { keywordMatcher } from "./fetch-helpers";
import type { CategoryId, ContentKind, Curation, FeedItem, Prefs } from "./types";

const TOPICS: Record<Exclude<CategoryId, "trending">, string[]> = {
  development: ["inference", "fine-tun", "framework", "sdk", "ollama", "vllm", "gguf", "quantization", "deployment", "rag", "mcp", "embedding", "api", "local model"],
  security: ["prompt injection", "jailbreak", "vulnerab", "exploit", "malware", "adversarial", "security", "privacy", "guardrail", "attack", "safety", "breach", "deepfake", "password", "credential", "phishing", "ransomware", "backdoor", "zero-day", "spyware", "hacked", "hacking"],
  vibecoding: ["claude code", "codex", "cursor", "copilot", "vibe cod", "coding agent", "code generation", "coding assistant"],
  research: ["research", "paper", "arxiv", "benchmark", "dataset", "training", "reasoning", "study", "evaluation", "scientist", "clinical trial", "experiment"],
  industry: ["funding", "acquisition", "partnership", "regulation", "lawsuit", "investment", "revenue", "ipo", "valuation", "compute deal", "compute contract", "market share", "web traffic", "data center", "datacenter", "outage", "pricing", "employment", "jobs", "worker", "layoff"],
};
const topicMatchers = Object.entries(TOPICS).map(([id, terms]) => [id as CategoryId, keywordMatcher(terms)] as const);
const release = keywordMatcher(["release", "launch", "introduc", "announc", "unveil", "debut", "rolls out", "rolling out", "now available", "generally available", "adds support"]);
const featureUpdate = /\b(?:adds?|gains?)\b.{0,45}\b(?:support|capabilit\w*|tracing|integration|feature|context window)\b/i;
const tutorial = keywordMatcher(["tutorial", "how to", "guide", "walkthrough", "getting started", "implementation", "step-by-step"]);
const tooling = keywordMatcher(["open-source", "open source", "sdk", "framework", "library", "repository", "cli", "plugin"]);
const technical = keywordMatcher([...TOPICS.development, "debug", "latency", "throughput", "reproduc", "implementation", "architecture"]);
const news = keywordMatcher(["outage", "banned", "ban ", "court", "lawsuit", "compute", "contract", "trial", "data center", "datacenter", "acquisition", "funding", "partnership", "regulation", "pricing", "price cut", "layoff", "agreement", "deal", "market share"]);
/** Corporate and legal actions that make a headline news; checked on the headline only. */
const newsHeadline = keywordMatcher(["appoint", "resign", "steps down", "investigat", "sues", "fined", "antitrust", "export control", "bans", "banning", "suspend", "halts", "restrict", "pulling"]);
const commentary = /\b(?:how i feel|my thoughts|what i think|why i (?:love|hate)|is a (?:freak|beast)|insane|mind[- ]blowing)\b/i;
const promotion = /\b(?:thanks? (?:to|you to) (?:our |the )?sponsor|(?:our |this (?:video|post)(?: is)? )?sponsor(?:ed)?(?: by)?|affiliate links?|use (?:my |our )?code|paid (?:partnership|promotion))\b/i;
const primaryDomains = ["openai.com", "anthropic.com", "deepmind.google", "blog.google", "research.google", "microsoft.com", "huggingface.co", "ai.meta.com", "mistral.ai", "arxiv.org"];
const primaryChannels = new Set(["openai", "anthropic", "google deepmind", "google", "microsoft", "hugging face"]);
/** AI-native labs whose own sites post announcements. Microsoft, Hugging Face and
 *  arXiv are primary too, but their sites carry far more than announcements. */
const labDomains = ["openai.com", "anthropic.com", "deepmind.google", "blog.google", "research.google", "ai.meta.com", "mistral.ai"];
/** A lab headline that leads with a versioned product name announces that version:
 *  "Gemini 4 Carbon: Our next frontier model", "Genie 4: A new generation…". */
const versionedLead = /^(?:[A-Z][A-Za-z]*[ -]?){1,3}v?\d+(?:\.\d+)*(?:[ -][A-Z][A-Za-z]*){0,2}\s*(?::|—|–| - |$)/;
const paperDomains = ["arxiv.org"];
/**
 * Publishers whose linked articles are reported news unless the headline marks an
 * opinion, review, first-person or question piece. Without this, any headline
 * that missed the keyword lists ("Apple is racing to make Siri more agentic")
 * was labeled Commentary and kept out of the Brief. Recognition is provenance,
 * not a quality or truth guarantee.
 */
const reportingDomains = [
  "techcrunch.com", "theverge.com", "arstechnica.com", "technologyreview.com", "the-decoder.com", "wired.com",
  "theregister.com", "zdnet.com", "spectrum.ieee.org", "404media.co", "techradar.com", "venturebeat.com",
  "engadget.com", "theinformation.com", "semafor.com", "restofworld.org", "tomshardware.com",
  "thehackernews.com", "bleepingcomputer.com", "krebsonsecurity.com", "darkreading.com",
  "reuters.com", "bloomberg.com", "apnews.com", "wsj.com", "nytimes.com", "ft.com", "washingtonpost.com",
  "theguardian.com", "bbc.com", "bbc.co.uk", "cnbc.com", "cnn.com", "npr.org", "axios.com", "politico.com",
  "businessinsider.com", "fortune.com", "nikkei.com", "scmp.com", "cbc.ca",
  "nature.com", "science.org", "newscientist.com", "scientificamerican.com",
];
const opinionSections = new Set(["opinion", "opinions", "commentisfree", "review", "reviews", "podcast", "podcasts", "newsletter", "newsletters", "column", "columns", "editorial", "editorials", "deals", "picture", "cartoon", "cartoons", "gallery", "video", "videos", "audio"]);
const opinionLead = /^\s*(?:opinion|review|hands[- ]on|editorial|column|podcast|newsletter|interview|q&a|explainer)\b\s*[:|—–-]/i;
const opinionSuffix = /\s[–—-]\s*(?:cartoon|podcast|video|review|in pictures)\s*$/i;
/** "I", "my", "me" as words. Not the I in "A.I." or "Google I/O". */
const firstPerson = /(?:^|[\s"“‘'(])(?:I|[Mm]y|[Mm]e|[Mm]yself)(?=[\s,;:!?.'’)]|$)/;
/** Quoted speech is the subject's voice, not the writer's. */
const unquoted = (title: string) => title.replace(/["“][^"”]*["”]|‘[^’]*’/g, " ");
/** "The best AI laptops", "7 ways to use ChatGPT". */
const listicle = /^\s*(?:(?:the|our)\s+)?(?:\d+\s+)?best\b|^\s*\d+\s+[a-z]/i;
/** The Guardian signs its opinion columns "Headline | Columnist Name". */
const columnistByline = /\s\|\s[A-Z][\w.'’-]+(?:\s[A-Z][\w.'’-]+){1,3}\s*$/;
const opinionPiece = (title: string, pathname: string, host: string) => firstPerson.test(unquoted(title)) || title.includes("?")
  || opinionLead.test(title) || opinionSuffix.test(title) || listicle.test(title)
  || (inDomains(host, ["theguardian.com"]) && columnistByline.test(title))
  || pathname.toLowerCase().split("/").some((segment) => opinionSections.has(segment));

const linkedUrl = (item: FeedItem): URL | null => {
  try { return new URL(item.externalUrl ?? item.url); } catch { return null; }
};
const linkedHost = (item: FeedItem): string => linkedUrl(item)?.hostname.toLowerCase() ?? "";
const inDomains = (host: string, domains: string[]) => domains.some((domain) => host === domain || host.endsWith("." + domain));
/** A paper feed item, or any post that links straight to the paper. */
export const isPaper = (item: FeedItem): boolean => item.source === "papers" || inDomains(linkedHost(item), paperDomains);

/** Only the editorial prefix; sponsor copy and links must not set relevance/topics. */
export function editorialText(text: string): string {
  const match = promotion.exec(text);
  return (match ? text.slice(0, match.index) : text).replace(/https?:\/\/\S+/g, " ").trim();
}

export function isPrimarySource(item: FeedItem): boolean {
  if (item.source === "papers") return true;
  if (item.source === "youtube") return primaryChannels.has((item.author ?? item.sourceMeta ?? "").trim().toLowerCase());
  return !isCommunityUpload(item) && inDomains(linkedHost(item), primaryDomains);
}

/**
 * Hugging Face hosts anyone's models, datasets and demos. Only its blog and
 * paper pages are publications: a stranger's dataset is neither an announcement
 * nor reporting, however the post that links it is worded.
 */
export function isCommunityUpload(item: FeedItem): boolean {
  return inDomains(linkedHost(item), ["huggingface.co"]) && !/^\/(?:blog|papers)(?:\/|$)/.test(linkedUrl(item)?.pathname ?? "");
}

const reasonMatchers = [...new Set([...AI_TERMS, ...Object.values(TOPICS).flat()])].map((term) => [term, keywordMatcher([term])] as const);

/** Explainable labels use publisher text, not generated claims or fact checking. */
export function classify(item: FeedItem): Curation {
  const title = editorialText(item.title);
  const body = editorialText(item.excerpt ?? "");
  let pathname = "";
  try { pathname = decodeURIComponent(new URL(item.externalUrl ?? item.url).pathname); } catch { /* text labels still work */ }
  const articlePath = pathname.replace(/[-_/]/g, " ");
  const host = linkedHost(item), paper = isPaper(item);
  const text = title + " " + body + " " + articlePath;
  // Relevance is a separate gate. Once AI relevance is known, a single explicit
  // topic mention in the editorial excerpt is useful evidence (e.g. a study).
  const topics = topicMatchers.filter(([, match]) => match(text)).map(([id]) => id);
  const laborStory = /\b(?:jobs|workers?|employment|layoffs?)\b/i.test(text);
  if (laborStory && !/\b(?:paper|study|arxiv|benchmark|experiment|evaluation)\b/i.test(text)) {
    const research = topics.indexOf("research");
    if (research >= 0) topics.splice(research, 1);
  }
  if (paper && !topics.includes("research")) topics.push("research");
  if (item.source === "github" && !topics.includes("development")) topics.push("development");
  const primary = isPrimarySource(item);
  const sponsored = /^\s*(?:sponsored|advertisement|advertorial|partner content|paid partnership)\b/i.test(item.title);
  const specific: ContentKind | null = paper ? "Research"
    : commentary.test(title) ? "Commentary"
    : tutorial(title) ? "Tutorial"
    : topics.includes("security") ? "Security"
    : release(title) || featureUpdate.test(title) || (inDomains(host, labDomains) && versionedLead.test(title)) ? "Release"
    : item.source === "github" || tooling(title) ? "Tool"
    : topics.includes("research") ? "Research"
    : topics.includes("industry") || news(text) || newsHeadline(title) ? "News"
    : null;
  // No keyword matched. An article from a recognized news publisher is still
  // reporting; everything else keeps the Discussion/Commentary fallback.
  const technicalText = technical(text);
  const reportedNews = !specific && inDomains(host, reportingDomains) && !opinionPiece(title, pathname, host);
  const kind: ContentKind = specific ?? (reportedNews ? "News" : technicalText ? "Discussion" : "Commentary");
  const matched = reasonMatchers.filter(([, matches]) => matches(text)).slice(0, 5).map(([term]) => term);
  return {
    kind, topics, primary, sponsored,
    substantive: !sponsored && ["News", "Release", "Research", "Security"].includes(kind),
    // A technical article that is news by publisher default used to be labeled
    // Discussion; it stays available to the Builder filter.
    builder: ["Release", "Tool", "Tutorial", "Research", "Security", "Discussion"].includes(kind) || (reportedNews && technicalText),
    reasons: [
      ...(primary ? ["Primary source"] : []),
      ...(matched.length ? ["Matched: " + matched.join(", ")] : ["Source: " + (item.sourceMeta ?? item.source)]),
      ...(topics.length ? ["Topics: " + topics.map((t) => CATEGORIES[t].label).join(", ")] : []),
      ...(reportedNews ? ["Reported by a recognized news publisher"] : []),
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
