// Local-only browser checks. All feed APIs and X widget responses are fixtures.
// APP_URL=http://127.0.0.1:3001 node tests/x-browser.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const appUrl = process.env.APP_URL || "http://127.0.0.1:3001";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(appUrl).hostname), "tests only run against a local server");
const KEY = "gcdsignal:x-links:v1";
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "chrome" });
const errors = [];
const unexpectedExternal = [];
const widgetFixture = `
window.__qaXCalls = [];
window.__qaXPending = [];
function render(kind, value, element) {
  window.__qaXCalls.push({ kind, value });
  const finish = () => {
    const node = document.createElement("div");
    node.dataset.qaX = kind;
    node.textContent = "Test widget: " + value;
    element.appendChild(node);
    return node;
  };
  if (value.includes("SlowSource")) {
    return new Promise(resolve => window.__qaXPending.push(() => resolve(finish())));
  }
  return Promise.resolve(finish());
}
window.twttr = { widgets: {
  createTimeline: (source, element) => render("timeline", source.url, element),
  createTweet: (id, element) => render("post", id, element)
} };
`;

async function setup({ stored = null, blockWrites = false, blockReads = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await context.addInitScript(({ key, stored, blockWrites, blockReads }) => {
    localStorage.setItem("gcdsignal:prefs", JSON.stringify({ v: 8, view: "x", contentMode: "broad", refreshMs: 0, hidden: ["bluesky", "github", "papers", "fourchan", "top10"] }));
    if (stored !== null) localStorage.setItem(key, stored);
    const originalSet = Storage.prototype.setItem;
    const originalGet = Storage.prototype.getItem;
    window.__qaBlockXWrites = blockWrites;
    window.__qaXWrites = 0;
    window.__qaReadStoredX = () => originalGet.call(localStorage, key);
    Storage.prototype.setItem = function (name, value) {
      if (name === key) {
        window.__qaXWrites += 1;
        if (window.__qaBlockXWrites) throw new DOMException("Blocked for test", "QuotaExceededError");
      }
      return originalSet.call(this, name, value);
    };
    Storage.prototype.getItem = function (name) {
      if (name === key && blockReads) throw new DOMException("Blocked for test", "SecurityError");
      return originalGet.call(this, name);
    };
  }, { key: KEY, stored, blockWrites, blockReads });
  const widgetRequests = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.href === "https://platform.twitter.com/widgets.js") {
      widgetRequests.push(url.href);
      return route.fulfill({ contentType: "application/javascript", body: widgetFixture });
    }
    if (url.origin !== new URL(appUrl).origin) {
      unexpectedExternal.push(url.href);
      return route.abort();
    }
    if (url.pathname === "/api/feeds/x-discovery") return route.fulfill({ json: { schemaVersion: 1, items: [], fetchedAt: new Date().toISOString(), health: { total: 0, failed: 0, succeeded: 0, degraded: false, details: [] } } });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: {
      schemaVersion: 2, top10: [], items: [], phase: url.searchParams.get("phase") || "all", windowHours: 24,
      fetchedAt: new Date().toISOString(), health: { total: 0, failed: 0, succeeded: 0, degraded: false, details: [] },
    } });
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(appUrl);
  const panel = page.getByRole("region", { name: "AI on X column", exact: true });
  await page.getByRole("button", { name: "Jump to X column", exact: true }).click();
  assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "X", exact: true }).count(), 0, "legacy X destination migrates to an inline home column");
  const briefNav = page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Brief", exact: true });
  assert.equal(await briefNav.getAttribute("aria-current"), "page", "legacy X selection opens the Brief homepage");
  await briefNav.click(); // In-memory preference migrations persist on the next explicit preference change.
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("gcdsignal:prefs")));
  assert.equal(prefs.v, 10);
  assert.equal(prefs.view, "brief");
  await panel.getByRole("button", { name: "Saved sources", exact: true }).click();
  await panel.getByRole("button", { name: "Save source", exact: true }).waitFor();
  return { context, page, panel, widgetRequests };
}

async function add(panel, value) {
  await panel.getByRole("textbox", { name: "Add an account or link", exact: true }).fill(value);
  await panel.getByRole("button", { name: "Save source", exact: true }).click();
  await panel.getByRole("button", { name: "Load embed", exact: true }).waitFor();
}

async function switchAwayAndBack(page) {
  const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
  await nav.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("region", { name: "Research library", exact: true }).waitFor();
  await nav.getByRole("button", { name: "Brief", exact: true }).click();
  await page.getByRole("button", { name: "Jump to X column", exact: true }).click();
  await page.getByRole("region", { name: "AI on X column", exact: true }).getByRole("button", { name: "Saved sources", exact: true }).click();
  await page.getByRole("region", { name: "AI on X column", exact: true }).getByRole("button", { name: "Load embed", exact: true }).waitFor();
}

try {
  const healthy = await setup();
  const { page, panel, widgetRequests } = healthy;
  await add(panel, "@QaReader");
  assert.equal(widgetRequests.length, 0, "saving a source does not contact X");
  await panel.getByRole("button", { name: "Load embed", exact: true }).click();
  await panel.locator('[data-qa-x="timeline"]').waitFor();
  await panel.getByRole("button", { name: "Reload embed", exact: true }).waitFor();
  assert.equal(widgetRequests.length, 1);
  assert.deepEqual(await page.evaluate(() => window.__qaXCalls), [{ kind: "timeline", value: "https://x.com/QaReader" }]);

  await add(panel, "@QaOther");
  assert.equal(await panel.locator("[data-qa-x]").count(), 0, "selecting another source removes the previous embed");
  assert.equal(await page.evaluate(() => window.__qaXCalls.length), 1, "source selection does not load a new widget");
  await panel.getByRole("button", { name: /^@QaReader\s+profile$/i }).click();
  assert.equal(await page.evaluate(() => window.__qaXCalls.length), 1, "selecting an already viewed source still requires consent");
  await panel.getByRole("button", { name: "Load embed", exact: true }).click();
  await panel.locator('[data-qa-x="timeline"]').waitFor();
  assert.equal(widgetRequests.length, 1, "the script is reused after a successful load");

  await add(panel, "https://x.com/QaReader/status/111");
  await add(panel, "https://x.com/QaReader/status/222");
  assert.equal(await panel.getByRole("button", { name: /^@QaReader · post 111\s+Saved post$/ }).count(), 1);
  assert.equal(await panel.getByRole("button", { name: /^@QaReader · post 222\s+Saved post$/ }).count(), 1, "posts from the same author have distinct labels");
  await panel.getByRole("button", { name: "Load embed", exact: true }).click();
  await panel.locator('[data-qa-x="post"]').waitFor();
  assert.equal(await panel.locator('[data-qa-x="post"]').innerText(), "Test widget: 222");
  assert.equal(await panel.getByRole("link", { name: "Open on X ↗", exact: true }).getAttribute("href"), "https://x.com/QaReader/status/222");

  await add(panel, "@SlowSource");
  await panel.getByRole("button", { name: "Load embed", exact: true }).click();
  await page.waitForFunction(() => window.__qaXPending.length === 1);
  await add(panel, "@QaOther");
  await page.evaluate(async () => { window.__qaXPending.shift()(); await Promise.resolve(); });
  assert.equal(await panel.locator("[data-qa-x]").count(), 0, "a stale widget result stays detached after switching sources");
  await panel.getByRole("button", { name: "Load embed", exact: true }).waitFor();
  assert.equal(widgetRequests.length, 1);
  await healthy.context.close();

  const blocked = await setup({ stored: JSON.stringify(["https://x.com/Original"]), blockWrites: true });
  await add(blocked.panel, "@UnsavedSource");
  await blocked.panel.getByRole("alert").waitFor();
  assert.equal(await blocked.page.evaluate(() => window.__qaReadStoredX()), JSON.stringify(["https://x.com/Original"]), "failed saves do not replace existing storage");
  await switchAwayAndBack(blocked.page);
  assert.equal(await blocked.panel.getByRole("button", { name: /^@UnsavedSource\s+profile$/i }).count(), 1, "unsaved links survive section navigation");
  await blocked.panel.getByRole("alert").waitFor();
  assert.equal(blocked.widgetRequests.length, 0, "memory recovery does not contact X");
  await blocked.page.evaluate(() => { window.__qaBlockXWrites = false; });
  await blocked.panel.getByRole("button", { name: "Retry saving links", exact: true }).click();
  await blocked.panel.getByRole("alert").waitFor({ state: "detached" });
  assert.deepEqual(await blocked.page.evaluate(() => JSON.parse(window.__qaReadStoredX())), ["https://x.com/Original", "https://x.com/UnsavedSource"], "retry saves the full recovered collection");
  await switchAwayAndBack(blocked.page);
  assert.equal(await blocked.panel.getByRole("alert").count(), 0, "successful saving clears the recovery warning");
  await blocked.context.close();

  for (const options of [{ stored: "{invalid-json" }, { stored: JSON.stringify(["https://x.com/Original"]), blockReads: true }]) {
    const recovery = await setup(options);
    await recovery.panel.getByRole("alert").waitFor();
    await add(recovery.panel, "@RecoverySource");
    assert.equal(await recovery.page.evaluate(() => window.__qaXWrites), 0, "unreadable saved data must never be overwritten");
    assert.equal(await recovery.page.evaluate(() => window.__qaReadStoredX()), options.stored);
    await switchAwayAndBack(recovery.page);
    assert.equal(await recovery.panel.getByRole("button", { name: /^@RecoverySource\s+profile$/i }).count(), 1);
    await recovery.panel.getByRole("alert").waitFor();
    assert.equal(recovery.widgetRequests.length, 0);
    await recovery.context.close();
  }
  assert.deepEqual(errors, [], "no client runtime errors");
  assert.deepEqual(unexpectedExternal, [], "no unexpected external requests");
  console.log("PASS: X timeline/post rendering, distinct post labels, consent on source switching, stale widget isolation, blocked-write navigation recovery and retry, unreadable-data preservation.");
} finally {
  await browser.close();
}
