// Optional: PLAYWRIGHT_PATH points to an existing Playwright installation.
// Run against a local dev server: APP_URL=http://localhost:3000 node tests/browser-smoke.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "chrome" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const calls = new Map();
let generation = 0;
const fixture = (source) => ({
  source, fetchedAt: new Date().toISOString(),
  items: Array.from({ length: 35 }, (_, i) => ({
    id: source + "-" + generation + "-" + i, source,
    title: i === 34 ? "Why I love ChatGPT" : "OpenAI SDK release " + source + String.fromCharCode(97 + i) + "unique",
    url: "https://" + source + ".example/story/" + generation + "/" + i,
    timestamp: new Date(Date.now() - i * 3600000).toISOString(),
    author: "qa-author", excerpt: "Open source developer tooling with an SDK. This is a test feed excerpt.",
    sourceMeta: source === "reddit" ? "r/LocalLLaMA" : "QA " + source,
  })),
});
await context.route("**/api/**", async (route) => {
  const url = new URL(route.request().url());
  calls.set(url.pathname, (calls.get(url.pathname) || 0) + 1);
  if (url.pathname === "/api/brief") return route.fulfill({ json: { top10: [], fetchedAt: new Date().toISOString() } });
  const source = url.pathname.split("/").at(-1);
  if (source === "bluesky") return route.fulfill({ json: { source, items: [], error: "QA upstream unavailable" } });
  if (source === "hackernews") await new Promise((resolve) => setTimeout(resolve, 700));
  return route.fulfill({ json: fixture(source) });
});
try {
  const appUrl = process.env.APP_URL || "http://127.0.0.1:3000";
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(appUrl).hostname), "tests only run against a local server");
  await page.goto(appUrl);
  await page.getByRole("button", { name: "Focus Reddit ↗" }).waitFor();
  await page.locator('[data-feed-id="reddit"] article').first().waitFor();
  assert.ok(calls.size < 6, "offscreen sources should be deferred on mobile");
  for (const width of [360, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await page.getByRole("button", { name: "Feed settings", exact: true }).boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, "settings must fit at " + width);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no document overflow at " + width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "More controls" }).click();
  await page.getByRole("button", { name: "Sort items: Signal", exact: true }).waitFor();
  await page.getByRole("button", { name: "More controls" }).click();
  await page.getByRole("button", { name: "Feed settings", exact: true }).click();
  await page.getByRole("dialog", { name: "Feed settings", exact: true }).waitFor();
  await page.getByRole("button", { name: "Close settings" }).focus();
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement.closest("dialog") !== null), true, "focus remains in dialog");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Feed settings");
  await page.getByRole("button", { name: /For You/ }).click();
  await page.locator("article").first().waitFor();
  await page.getByText("unavailable right now: Bluesky", { exact: true }).waitFor();
  assert.match(await page.getByRole("contentinfo").innerText(), /DEGRADED/);
  assert.equal(await page.locator("dialog").count(), 0, "closed lazy dialogs are not mounted");
  await page.getByRole("button", { name: /^Preview / }).first().click();
  await page.getByRole("dialog").waitFor();
  await page.getByText("Why shown?", { exact: true }).click();
  assert.ok(await page.getByText(/Rule-based labels/).isVisible());
  await page.getByRole("button", { name: "Follow Development", exact: true }).click();
  assert.ok(await page.getByRole("button", { name: "Following Development", exact: true }).isVisible());
  await page.getByRole("button", { name: "Mute qa-author", exact: true }).click();
  assert.ok(await page.getByRole("button", { name: "Unmute qa-author", exact: true }).isVisible());
  await page.getByRole("button", { name: "Unmute qa-author", exact: true }).click();
  await page.getByRole("button", { name: "Close story" }).click();
  await page.getByRole("button", { name: "Broad", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Broad", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "Builder", exact: true }).click();
  await page.getByRole("button", { name: /Deck/ }).click();
  await page.getByRole("button", { name: "Focus Reddit ↗" }).scrollIntoViewIfNeeded();
  const deckLeft = await page.locator(".deck-scroll").evaluate((el) => el.scrollLeft);
  await page.getByRole("button", { name: "Focus Reddit ↗" }).click();
  assert.equal(await page.locator('[data-feed-id]:visible').count(), 1);
  await page.getByRole("button", { name: "← Back to deck", exact: true }).click();
  await page.getByRole("button", { name: "Focus Reddit ↗" }).waitFor();
  assert.ok(Math.abs(await page.locator(".deck-scroll").evaluate((el) => el.scrollLeft) - deckLeft) <= 1, "returning from focus restores horizontal position");
  await page.screenshot({ path: join(tmpdir(), "gcdsignal-mobile-qa.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: join(tmpdir(), "gcdsignal-desktop-qa.png") });
  await page.getByRole("button", { name: /palette/ }).click();
  await page.getByRole("dialog", { name: "Command palette" }).waitFor();
  await page.getByRole("textbox", { name: "Command" }).fill("text size");
  await page.keyboard.press("Tab");
  assert.ok(await page.evaluate(() => document.activeElement.closest("dialog") !== null));
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });

  // Isolate auto-refresh from user reading: one source, no real upstream calls.
  const reader = await context.newPage();
  reader.on("pageerror", (e) => errors.push(e.message));
  await reader.clock.install();
  await reader.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("gcdsignal:prefs", JSON.stringify({
      v: 6, view: "foryou", sortMode: "signal", contentMode: "builder",
      hidden: ["top10", "reddit", "youtube", "bluesky", "hackernews", "papers", "github", "fourchan"],
      refreshMs: 60000,
    }));
  });
  await reader.goto(appUrl);
  await reader.locator("article").first().waitFor();
  await reader.locator(".feed-scroll").evaluate((el) => { el.scrollTop = 400; });
  const before = await reader.locator("article").first().getAttribute("data-item-key");
  generation++;
  await reader.clock.fastForward(61000);
  const pending = reader.getByRole("button", { name: /↑ \d+ new/ });
  await pending.waitFor();
  assert.equal(await reader.locator("article").first().getAttribute("data-item-key"), before, "auto-refresh must not replace the reading list");
  assert.ok(await reader.locator(".feed-scroll").evaluate((el) => el.scrollTop > 300), "reading position survives auto-refresh");
  await pending.click();
  await reader.clock.runFor(500);
  assert.notEqual(await reader.locator("article").first().getAttribute("data-item-key"), before, "new items apply only on request");
  assert.equal(await reader.locator(".feed-scroll").evaluate((el) => el.scrollTop), 0);
  await reader.close();
  assert.deepEqual(errors, [], "no client runtime errors");
  console.log("PASS: responsive widths, deferred sources, controls, dialog focus, preferences, status, reader, focus position and held auto-refresh");
  console.log("Screenshots: " + join(tmpdir(), "gcdsignal-mobile-qa.png") + " and " + join(tmpdir(), "gcdsignal-desktop-qa.png"));
} finally { await browser.close(); }
