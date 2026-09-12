// Optional local-only browser spot check with REAL upstreams, not a CWV audit.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { tmpdir } from "node:os";
import { join } from "node:path";
const appUrl = process.env.APP_URL || "http://127.0.0.1:3001";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(appUrl).hostname));
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = [];
  page.on("response", async (response) => {
    if (response.url().includes("/api/brief")) {
      try { const body = await response.json(); api.push({ phase: body.phase, stories: body.top10?.length, health: body.health, error: body.error, stale: body.stale }); } catch { /* Redirect. */ }
    }
  });
  const results = [];
  for (const mode of ["cold-browser", "warm-browser"]) {
    const started = Date.now();
    if (mode === "cold-browser") await page.goto(appUrl); else await page.reload();
    await page.locator(".brief-story h2").first().waitFor({ timeout: 45000 });
    const firstHeadlineMs = Date.now() - started;
    if (mode === "cold-browser") {
      await page.waitForFunction(() => !document.querySelector(".coverage-panel")?.textContent?.includes("Additional discussions are still loading"), null, { timeout: 45000 });
    }
    await page.waitForLoadState("networkidle");
    results.push({ mode, firstHeadlineMs, ...(await page.evaluate(() => {
      const resources = performance.getEntriesByType("resource");
      const bytes = (extension) => resources.filter((entry) => new URL(entry.name).pathname.endsWith(extension)).reduce((sum, entry) => sum + entry.transferSize, 0);
      return {
        javascriptTransferBytes: bytes(".js"), cssTransferBytes: bytes(".css"),
        briefRequests: resources.filter((entry) => entry.name.includes("/api/brief")).length,
        storyCount: document.querySelectorAll(".brief-story").length,
        firstHeadlineY: Math.round(document.querySelector(".brief-story h2").getBoundingClientRect().top),
        bodyOverflow: document.body.scrollWidth > innerWidth,
        rootShiftX: window.scrollX,
        rootOverflowX: getComputedStyle(document.documentElement).overflowX,
        xRequests: resources.filter((entry) => /platform\.twitter|syndication\.twitter/.test(entry.name)).length,
      };
    })) });
  }
  await page.screenshot({ path: join(tmpdir(), "gcdsignal-live-mobile-qa.png"), fullPage: true });
  assert.ok(api.some((entry) => entry.phase === "all" && entry.stories > 0 && !entry.error), "complete real Brief must retain useful content");
  assert.deepEqual(errors, [], "no browser runtime errors");
  console.log(JSON.stringify({ conditions: "Local production server, 390x844, 150ms latency, 1.6Mbps download, 4x CPU slowdown; server cache may already be warm. First headline is not LCP.", results, api, errors }, null, 2));
} finally { await browser.close(); }
