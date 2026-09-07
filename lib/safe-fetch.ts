import { lookup } from "node:dns";
import { request } from "node:https";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";

export const FEED_MAX_BYTES = 2 * 1024 * 1024;
export const FEED_TIMEOUT_MS = 6000;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** Fail closed on non-global destinations, including IPv4-mapped IPv6. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) || (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
  }
  if (family === 6) {
    const [first, second = "0"] = address.toLowerCase().split(":");
    const a = parseInt(first, 16), b = parseInt(second || "0", 16);
    return a >= 0x2000 && a <= 0x3fff && a !== 0x2002 && a !== 0x3fff &&
      !(a === 0x2001 && (b < 0x200 || b === 0xdb8));
  }
  return false;
}

export function validateFeedUrl(value: string): URL {
  if (value.length > 2048) throw new Error("Invalid feed URL");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid feed URL"); }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol !== "https:" || url.username || url.password ||
      (url.port && url.port !== "443") || isIP(host.replace(/^\[|\]$/g, "")) ||
      !host.includes(".") || host === "localhost" ||
      [".localhost", ".local", ".internal", ".test", ".invalid"].some((suffix) => host.endsWith(suffix))) {
    throw new Error("Feed URL must use public HTTPS without credentials");
  }
  url.hostname = host;
  url.hash = "";
  return url;
}

/** The socket uses exactly the validated DNS answer; there is no second lookup. */
export const publicLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error || !addresses?.length || addresses.some((entry) => !isPublicAddress(entry.address))) {
      callback(new Error("Feed destination is not public"), "", 4);
      return;
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
};

let active = 0;
const waiting: Array<() => void> = [];
async function acquire(signal: AbortSignal): Promise<() => void> {
  if (active >= 4) {
    if (waiting.length >= 32) throw new Error("Feed fetch capacity reached");
    await new Promise<void>((resolve, reject) => {
      const ready = () => { signal.removeEventListener("abort", cancel); resolve(); };
      const cancel = () => {
        const index = waiting.indexOf(ready);
        if (index >= 0) waiting.splice(index, 1);
        reject(new Error("Feed request timed out"));
      };
      waiting.push(ready);
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
    });
  } else active++;
  if (signal.aborted) { release(); throw new Error("Feed request timed out"); }
  return release;
}
function release() {
  const next = waiting.shift();
  if (next) next(); else active--;
}

interface Hop { status: number; location?: string; text: string }
function fetchHop(url: URL, signal: AbortSignal): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: "GET", lookup: publicLookup, agent: false, signal,
      headers: { "User-Agent": "gcdSignal/1.0 (AI news aggregator)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml", "Accept-Encoding": "identity" },
    }, (res) => {
      const status = res.statusCode ?? 0;
      if (REDIRECTS.has(status)) {
        const location = res.headers.location;
        res.destroy();
        resolve({ status, location, text: "" });
        return;
      }
      if (status < 200 || status >= 300) { res.destroy(); reject(new Error("Feed publisher unavailable")); return; }
      if (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") {
        res.destroy(); reject(new Error("Unsupported feed encoding")); return;
      }
      if (Number(res.headers["content-length"]) > FEED_MAX_BYTES) {
        res.destroy(); reject(new Error("Feed response exceeds 2 MB")); return;
      }
      let bytes = 0;
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > FEED_MAX_BYTES) { res.destroy(new Error("Feed response exceeds 2 MB")); return; }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({ status, text: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("error", () => reject(new Error(signal.aborted ? "Feed request timed out" : "Feed publisher unavailable")));
    req.end();
  });
}

/** Custom URLs never use fetch's automatic redirects or an unpinned DNS check. */
export async function safeFeedText(value: string): Promise<string> {
  let url = validateFeedUrl(value);
  const signal = AbortSignal.timeout(FEED_TIMEOUT_MS);
  const unlock = await acquire(signal);
  try {
    for (let redirects = 0; ; redirects++) {
      const result = await fetchHop(url, signal);
      if (!REDIRECTS.has(result.status)) return result.text;
      if (!result.location || redirects >= 3) throw new Error("Too many feed redirects");
      url = validateFeedUrl(new URL(result.location, url).toString());
    }
  } finally { unlock(); }
}
