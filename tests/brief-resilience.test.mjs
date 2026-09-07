import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { load } from "./load-ts.mjs";
const require = createRequire(import.meta.url);
const Module = require("node:module");
const originalLoad = Module._load;
const news = { id: "rss:release", source: "rss", title: "OpenAI releases a new GPT model", url: "https://openai.com/news/new-model", timestamp: new Date().toISOString() };

Module._load = function (request, parent, isMain) {
  if (parent?.filename.endsWith("route.ts")) {
    if (request === "next/server") return { NextResponse: { json: (body) => ({ body }) } };
    if (request === "@/lib/sources") return { loadSource: async (source) => source === "rss" ? [news]
      : source === "papers" ? [{ ...news, id: "papers:malformed", source, title: { text: "Invalid provider field" } }] : [] };
    if (request === "@/lib/server-cache") return { sharedServerLoad: async (_key, loader) => loader() };
    if (request === "@/lib/last-good") return { recallGood: () => null, rememberGood: () => {} };
    if (request.startsWith("@/lib/")) return load("../" + request.slice(2) + ".ts");
  }
  return originalLoad.call(this, request, parent, isMain);
};
let GET;
try { ({ GET } = load("../app/api/brief/route.ts")); } finally { Module._load = originalLoad; }

test("one malformed contributor cannot discard the healthy full brief", async () => {
  const { body } = await GET({ nextUrl: new URL("https://signal.example/api/brief?category=trending&phase=all&window=24") });
  assert.equal(body.error, undefined);
  assert.ok(body.top10.some((story) => story.url === news.url));
  assert.equal(body.health.failed, 1);
  assert.equal(body.health.degraded, true);
  assert.ok(body.health.details.some((detail) => detail.id === "papers" && detail.status === "error"));
  assert.ok(body.health.details.some((detail) => detail.id === "rss" && detail.status === "ok"));
});
