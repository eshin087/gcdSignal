import { unstable_cache } from "next/cache";
import { safeFeedText } from "./safe-fetch";

export async function readRssDocument(url: string): Promise<{ xml: string; fetchedAt: string }> {
  const xml = await safeFeedText(url);
  return { xml, fetchedAt: new Date().toISOString() };
}

// This non-Cache-Components app retains Next's supported persistent function
// cache. Moving to `use cache` requires the separate Cache Components migration.
// URL is an explicit cache argument; the original retrieval time is cached too.
const cachedDocument = unstable_cache(readRssDocument, ["signal-safe-rss-v1"], { revalidate: 300 });
export async function readCachedRssDocument(url: string) {
  const document = await cachedDocument(url);
  if (Date.now() - Date.parse(document.fetchedAt) > 24 * 3600_000) {
    throw new Error("Publisher data is too old");
  }
  return document;
}
