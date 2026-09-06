import type { FeedItem } from "./types";

/** Remove tracking, preserving parameters that identify articles and videos. */
export function canonicalUrl(value: string): string {
  try {
    const u = new URL(value);
    u.hash = "";
    u.hostname = u.hostname.replace(/^www\./, "");
    for (const key of [...u.searchParams.keys()]) if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) u.searchParams.delete(key);
    if (u.hostname === "youtu.be") return `https://youtube.com/watch?v=${encodeURIComponent(u.pathname.slice(1))}`;
    if (u.hostname === "youtube.com" && u.pathname === "/watch" && u.searchParams.has("v")) return `https://youtube.com/watch?v=${encodeURIComponent(u.searchParams.get("v")!)}`;
    u.searchParams.sort();
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch { return value; }
}

export function publisher(item: FeedItem): string {
  if (item.source === "rss") {
    try { return new URL(item.url).hostname.replace(/^www\./, ""); }
    catch { return item.sourceMeta ?? "RSS"; }
  }
  return item.source;
}

const STOP = new Set("the a an and or of to in on for with is are was be been its it at by as from how why what when where who which than then that this these not but has have had will can could would should may might you your we our they their his her says said announces announced launches launched releases released release launch introduces unveils now just over about into more most up out vs amid report reportedly using use used against during between while some all one two new first get gets got make makes made do does did here there still no yes so if because before off back ai artificial intelligence".split(" "));
const tokens = (title: string) => new Set(title.toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9.-]+/).filter((t) => t.length >= 3 && !STOP.has(t)));

export function sameEvent(a: FeedItem, b: FeedItem): boolean {
  const au = canonicalUrl(a.externalUrl ?? a.url), bu = canonicalUrl(b.externalUrl ?? b.url);
  // A shared homepage is not an article identity.
  try { const u = new URL(au); if (au === bu && (u.pathname !== "/" || u.search)) return true; } catch { /* compare titles below */ }
  // Different model/software versions should not collapse into one release.
  const versions = (title: string): string[] => title.toLowerCase().match(/\b[a-z]+[- ]?\d+(?:\.\d+)+\b|\bv?\d+\.\d+(?:\.\d+)*\b/g) ?? [];
  const av = versions(a.title), bv = versions(b.title);
  if (av.length && bv.length && !av.some((v) => bv.includes(v))) return false;
  if (Math.abs(Date.parse(a.timestamp) - Date.parse(b.timestamp)) > 48 * 3600000) return false;
  const at = tokens(a.title), bt = tokens(b.title);
  if (!at.size || !bt.size) return false;
  const shared = [...at].filter((t) => bt.has(t)).length;
  return a.title.trim().toLowerCase() === b.title.trim().toLowerCase()
    || (shared >= 3 && shared / Math.min(at.size, bt.size) >= 0.45);
}

export function groupStories(items: FeedItem[]): FeedItem[][] {
  const groups: FeedItem[][] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.source}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Representative comparison avoids transitive A→B→C false merges.
    const group = groups.find((g) => sameEvent(g[0], item));
    if (group) group.push(item);
    else groups.push([item]);
  }
  return groups;
}
