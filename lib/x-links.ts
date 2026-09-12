export interface XLink { url: string; kind: "profile" | "list" | "post"; postId?: string }
/** Accept identifiers only, never pasted widget HTML or arbitrary script URLs. */
export function parseXLink(raw: string): XLink | null {
  if (raw.length > 500) return null;
  const input = raw.trim();
  const candidate = /^@?[A-Za-z0-9_]{1,15}$/.test(input) ? "https://x.com/" + input.replace(/^@/, "") : input;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname)) return null;
    const path = url.pathname.replace(/\/+$/, "");
    const post = path.match(/^\/[A-Za-z0-9_]{1,15}\/status\/(\d{1,25})$/);
    if (post) return { url: "https://x.com" + path, kind: "post", postId: post[1] };
    if (/^\/i\/lists\/\d{1,25}$/.test(path) || (!/^\/i\//i.test(path) && /^\/[A-Za-z0-9_]{1,15}\/lists\/[A-Za-z0-9_-]{1,100}$/.test(path))) return { url: "https://x.com" + path, kind: "list" };
    if (/^\/[A-Za-z0-9_]{1,15}$/.test(path) && !/^\/(home|search|explore|settings|intent|login|logout|signup|i|messages|notifications)$/i.test(path)) return { url: "https://x.com" + path, kind: "profile" };
  } catch { /* Invalid URL is not an embed. */ }
  return null;
}
