// Local-only queue regressions. Feed responses are fixtures; no external service is used.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const appUrl = process.env.APP_URL || "http://127.0.0.1:3001";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(appUrl).hostname));
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "chrome" });
const errors = [];
const key = "gcdsignal:reading-queue:v1";
const now = () => new Date().toISOString();
const rssTitle = "AI research release for reliable language models";
const xTitle = "AI model announcement discussed on X";
const health = () => ({ total: 1, succeeded: 1, failed: 0, degraded: false, details: [{ id: "Fixture", status: "ok", lastSuccessAt: now() }] });

async function setup({ failWrite = false, corrupt = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.addInitScript(({ failWrite, corrupt, key }) => {
    if (!sessionStorage.getItem("queue-fixture-seeded")) {
      localStorage.setItem("gcdsignal:prefs", JSON.stringify({ v: 9, view: "deck", refreshMs: 0, hidden: ["top10", "bluesky", "fourchan", "github", "papers", "youtube", "reddit", "hackernews"] }));
      localStorage.setItem("gcdsignal:x-links:v1", '["https://x.com/KeepBookmark/status/999"]');
      if (corrupt) localStorage.setItem(key, "unreadable prior queue");
      sessionStorage.setItem("queue-fixture-seeded", "1");
    }
    window.__queueFailWrite = failWrite;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (storageKey, value) {
      if (storageKey === key && window.__queueFailWrite) throw new DOMException("Fixture quota", "QuotaExceededError");
      return setItem.call(this, storageKey, value);
    };
  }, { failWrite, corrupt, key });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(appUrl).origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/feeds/x-discovery") return route.fulfill({ json: { schemaVersion: 1, fetchedAt: now(), health: health(), items: [{ id: "777", url: "https://x.com/QueueFixture/status/777", author: "QueueFixture", title: xTitle, sharedAt: now(), rank: 100, reasons: ["Shared on Hacker News"], mentions: [{ source: "hackernews", sourceUrl: "https://news.ycombinator.com/item?id=777", sourceTitle: xTitle, sharedAt: now(), points: 12, comments: 3 }] }] } });
    if (url.pathname === "/api/feeds/rss") return route.fulfill({ json: { schemaVersion: 2, source: "rss", fetchedAt: now(), health: health(), items: [{ id: "queue-rss", source: "rss", title: rssTitle, url: "https://example.com/queue-research", timestamp: now(), sourceMeta: "Fixture newsroom", author: "Research team", excerpt: "An AI research announcement with a primary paper and evaluation results.", curation: { kind: "Research", topics: ["research"], reasons: ["Primary paper"], builder: false, substantive: true } }] } });
    return route.fulfill({ json: { schemaVersion: 2, items: [], top10: [], fetchedAt: now(), health: health() } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(appUrl);
  await page.locator('[data-feed-id="rss"] article').first().waitFor();
  return { page, context };
}

async function add(page, title) {
  const article = page.locator("article").filter({ hasText: title }).first();
  const details = article.locator("summary").filter({ hasText: "Details" }).first();
  await details.click();
  await article.getByRole("button", { name: "Add to Must read", exact: true }).click();
}
const queueButton = (page) => page.getByRole("button", { name: /^Must read(?:$|[ ·(])/ }).first();
async function openQueue(page) {
  await queueButton(page).click();
  const dialog = page.getByRole("dialog", { name: "Must read queue", exact: true });
  await dialog.waitFor(); return dialog;
}

try {
  const { page, context } = await setup();
  await add(page, rssTitle); await add(page, xTitle);
  let dialog = await openQueue(page);
  assert.equal(await dialog.locator("ol li").count(), 2, "news and X share one queue");
  assert.deepEqual(await dialog.locator("ol li a").allTextContents(), [rssTitle, xTitle]);
  assert.equal(await dialog.locator("ol li a").first().getAttribute("target"), "_blank");
  const downloadEvent = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export queue", exact: true }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  const backup = Buffer.concat(chunks);
  assert.equal(JSON.parse(backup.toString()).items.length, 2);
  await dialog.locator("button[data-queue-done]").first().click();
  assert.equal(await dialog.locator("ol li").count(), 1);
  assert.equal(await dialog.locator("button[data-queue-done]").evaluate((element) => element === document.activeElement), true, "Done moves focus to the next queued item");
  assert.equal(await page.evaluate(() => localStorage.getItem("gcdsignal:x-links:v1")), '["https://x.com/KeepBookmark/status/999"]', "Done does not touch X bookmarks");
  await dialog.getByLabel("Import queue backup", { exact: true }).setInputFiles({ name: "queue.json", mimeType: "application/json", buffer: backup });
  await dialog.getByRole("status").filter({ hasText: "1 item added" }).waitFor();
  assert.equal(await dialog.locator("ol li").count(), 2);
  await dialog.getByLabel("Import queue backup", { exact: true }).setInputFiles({ name: "unsafe.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, items: [{ id: "evil", title: "Unsafe link", source: "Fake", url: "javascript:alert(1)", addedAt: 1 }] })) });
  await dialog.getByRole("status").filter({ hasText: "invalid item" }).waitFor();
  assert.equal(await dialog.locator("ol li").count(), 2, "malformed import is atomic");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no document overflow`);
    for (const button of await dialog.getByRole("button").all()) {
      const bounds = await button.boundingBox();
      assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44, `${width}: queue buttons have 44px targets`);
    }
  }
  await dialog.getByRole("button", { name: "Close Must read queue", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  assert.equal(await dialog.getByRole("button", { name: "Import queue", exact: true }).evaluate((element) => element === document.activeElement), true, "focus wraps inside the native dialog");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await queueButton(page).evaluate((element) => element === document.activeElement), true, "closing restores header focus");
  await page.reload();
  dialog = await openQueue(page);
  assert.equal(await dialog.locator("ol li").count(), 2, "queue survives reload");
  await context.close();

  const failed = await setup({ failWrite: true });
  await add(failed.page, rssTitle);
  let failedDialog = await openQueue(failed.page);
  await failedDialog.getByRole("alert").filter({ hasText: "could not be saved" }).waitFor();
  assert.equal(await failedDialog.locator("ol li").count(), 1);
  await failedDialog.getByRole("button", { name: "Close Must read queue", exact: true }).click();
  const nav = failed.page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: "Library", exact: true }).click();
  await nav.getByRole("button", { name: "Deck", exact: true }).click();
  failedDialog = await openQueue(failed.page);
  assert.equal(await failedDialog.locator("ol li").count(), 1, "failed saves survive in-app navigation");
  await failed.page.evaluate(() => { window.__queueFailWrite = false; });
  await failedDialog.getByRole("button", { name: "Retry storage", exact: true }).click();
  assert.equal(await failedDialog.getByRole("alert").count(), 0);
  assert.equal(await failed.page.evaluate((key) => JSON.parse(localStorage.getItem(key)).items.length, key), 1);
  await failed.context.close();

  const corrupt = await setup({ corrupt: true });
  await add(corrupt.page, rssTitle);
  const corruptDialog = await openQueue(corrupt.page);
  await corruptDialog.getByRole("alert").filter({ hasText: "has not been overwritten" }).waitFor();
  assert.equal(await corrupt.page.evaluate((key) => localStorage.getItem(key), key), "unreadable prior queue");
  assert.equal(await corruptDialog.locator("ol li").count(), 1);
  await corrupt.context.close();
  assert.deepEqual(errors, []);
  console.log("Must read queue browser regressions passed: cross-column adds, backup round-trip, safe import, Done isolation, reload, focus, mobile targets, storage failure and recovery.");
} finally { await browser.close(); }
