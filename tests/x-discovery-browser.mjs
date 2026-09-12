// Local app only; all feed responses and X widgets are synthetic fixtures.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const appUrl = process.env.APP_URL || "http://127.0.0.1:3001";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(appUrl).hostname));
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "chrome" });
const errors = [];
const time = (hours = 0) => new Date(Date.now() - hours * 3600_000).toISOString();
function fixture() {
  return { schemaVersion: 1, fetchedAt: time(), health: { total: 2, succeeded: 2, failed: 0, degraded: false, details: [
    { id: "hackernews:twitter.com", status: "ok", lastSuccessAt: time() }, { id: "latent-space", status: "ok", lastSuccessAt: time() },
  ] }, items: [
    { id: "111", url: "https://x.com/QaRelease/status/111", author: "QaRelease", title: "AI model release with a useful demo", sharedAt: time(18), rank: 1200, reasons: ["Shared on Hacker News", "100 HN points"], mentions: [{ source: "hackernews", sourceUrl: "https://news.ycombinator.com/item?id=101", sourceTitle: "AI model release", sharedAt: time(18), points: 100, comments: 30 }] },
    { id: "222", url: "https://x.com/QaResearch/status/222", author: "QaResearch", title: "AI research paper on reliable inference", sharedAt: time(1), rank: 900, reasons: ["Selected in Latent Space"], mentions: [{ source: "latent-space", sourceUrl: "https://www.latent.space/p/qa-research", sourceTitle: "AI news roundup", sharedAt: time(1) }] },
    { id: "333", url: "https://x.com/QaArchive/status/333", author: "QaArchive", title: "Older AI benchmark discussion", sharedAt: time(120), rank: 100, reasons: ["Shared on Hacker News"], mentions: [{ source: "hackernews", sourceUrl: "https://news.ycombinator.com/item?id=103", sourceTitle: "Older AI benchmark discussion", sharedAt: time(120), points: 4 }] },
  ] };
}

async function setup({ blockWidgets = false, empty = false, blockStorage = false } = {}) {
  const state = { data: fixture(), fail: false, delay: null, requests: [], external: [] };
  if (empty) state.data.items = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await context.addInitScript(({ blockStorage }) => {
    localStorage.setItem("gcdsignal:prefs", JSON.stringify({ v: 10, refreshMs: 0 }));
    const clock = Date.now;
    window.__clockOffset = 0;
    Date.now = () => clock() + window.__clockOffset;
    if (blockStorage) {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "gcdsignal:x-links:v1") throw new DOMException("Test quota", "QuotaExceededError");
        return original.call(this, key, value);
      };
    }
  }, { blockStorage });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(appUrl).origin) {
      state.external.push(url.href);
      if (url.href === "https://platform.twitter.com/widgets.js" && !blockWidgets) return route.fulfill({ contentType: "application/javascript", body: `window.twttr={widgets:{createTimeline:()=>Promise.resolve(),createTweet:(id,element)=>{const p=document.createElement('iframe');p.title='Fixture original post '+id;p.srcdoc='<button>Original post action</button>';p.dataset.qaPost=id;element.append(p);return Promise.resolve(p)}}};` });
      return route.abort();
    }
    if (url.pathname === "/api/feeds/x-discovery") {
      state.requests.push(url.href);
      if (state.delay) await state.delay;
      return state.fail ? route.fulfill({ status: 503, json: { error: "Fixture outage" } }) : route.fulfill({ json: state.data });
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { schemaVersion: 2, items: [], top10: [], fetchedAt: time(), health: { total: 0, succeeded: 0, failed: 0, degraded: false } } });
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(appUrl);
  const panel = page.getByRole("region", { name: "X discoveries", exact: true });
  const column = page.getByRole("region", { name: "AI on X column", exact: true });
  const refresh = column.getByRole("button", { name: "Refresh AI on X", exact: true });
  await refresh.waitFor();
  await page.getByRole("button", { name: "Jump to X column", exact: true }).click();
  return { context, page, panel, column, refresh, state };
}

async function openStoryDetails(article) {
  const details = article.locator("details[data-story-details]");
  if (await details.getAttribute("open") === null) await details.locator("summary").click();
  await details.locator(".story-details-body").waitFor({ state: "visible" });
  return details;
}

try {
  const { context, page, panel, column, refresh, state } = await setup();
  assert.equal(await panel.locator("article").count(), 2, "automatic discoveries show without handles");
  assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "X", exact: true }).count(), 0, "X has no separate navigation tab");
  assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Brief", exact: true }).getAttribute("aria-current"), "page", "automatic X appears on the default homepage");
  const firstDiscovery = panel.locator("article").first();
  assert.equal(await firstDiscovery.getByRole("heading").innerText(), "AI model release with a useful demo");
  assert.equal(await firstDiscovery.locator("details[data-story-details]").getAttribute("open"), null, "story Details start collapsed");
  assert.equal(await firstDiscovery.locator('button[aria-label="Load post from X"]').isVisible(), false, "collapsed cards hide the bulky X preview action");
  assert.equal(await firstDiscovery.locator('button[aria-label="Save post"]').isVisible(), false, "collapsed cards hide the X save action");
  const collapsedText = await firstDiscovery.innerText();
  assert.match(collapsedText, /30 HN comments/, "the visible discussion count is labeled as Hacker News comments");
  assert.doesNotMatch(collapsedText, /\b(?:views?|likes?|replies?)\b/i, "the collapsed card makes no visible claim about unavailable X metrics");
  assert.deepEqual(state.external, [], "discovery does not load X or images automatically");
  assert.equal(await panel.getByRole("button", { name: "Filter", exact: true }).getAttribute("aria-expanded"), "false", "advanced controls start collapsed");
  assert.equal(await panel.getByRole("combobox").count(), 0, "date and sorting controls do not occupy the default column");
  assert.equal(await column.getByRole("button", { name: "Saved sources", exact: true }).getAttribute("aria-pressed"), "false");
  assert.equal(await column.getByRole("button", { name: "Discover", exact: true }).count(), 0, "default discovery needs no extra tab row");
  await panel.getByRole("button", { name: "Filter", exact: true }).click();
  await panel.getByRole("combobox", { name: "Order", exact: true }).selectOption("new");
  assert.match(await panel.locator("article").first().innerText(), /research paper/);
  await panel.getByRole("searchbox", { name: "Filter discoveries", exact: true }).fill("demo");
  assert.equal(await panel.locator("article").count(), 1);
  await panel.getByRole("searchbox", { name: "Filter discoveries", exact: true }).fill("");
  await panel.getByRole("combobox", { name: "Shared within", exact: true }).selectOption("168");
  assert.equal(await panel.locator("article").count(), 3);
  await panel.getByRole("combobox", { name: "Shared within", exact: true }).selectOption("72");
  await panel.getByRole("combobox", { name: "Order", exact: true }).selectOption("popular");
  await panel.getByRole("button", { name: "Filter", exact: true }).click();
  const release = panel.locator("article").filter({ hasText: "useful demo" });
  const releaseDetails = await openStoryDetails(release);
  await release.getByRole("button", { name: "Save post", exact: true }).click();
  await release.getByRole("button", { name: "Saved", exact: true }).waitFor();
  await releaseDetails.getByText(/X views, likes, and replies are unavailable/).waitFor();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("gcdsignal:x-links:v1"))), ["https://x.com/QaRelease/status/111"]);
  assert.deepEqual(state.external, [], "saving still does not contact X");
  await page.getByRole("button", { name: "Saved sources", exact: true }).click();
  await page.getByRole("button", { name: "Load embed", exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Build your X reading space", exact: true }).count(), 0, "first saved discovery is selected in the viewer");
  await page.evaluate(() => {
    window.__originalFocus = HTMLElement.prototype.focus;
    window.__hiddenCardFocusAttempts = 0;
    HTMLElement.prototype.focus = function (...args) {
      if (this.matches("article[tabindex]") && !this.getClientRects().length) window.__hiddenCardFocusAttempts++;
      return window.__originalFocus.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Saved sources", exact: true }).focus();
  await page.keyboard.press("j");
  assert.equal(await page.evaluate(() => window.__hiddenCardFocusAttempts), 0, "keyboard navigation never attempts to focus a hidden discovery card");
  await page.evaluate(() => { HTMLElement.prototype.focus = window.__originalFocus; delete window.__originalFocus; });
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await panel.locator("article").first().waitFor();
  await panel.locator("article").first().focus();
  await page.keyboard.press("j");
  assert.equal(await panel.locator("article").nth(1).evaluate((element) => element === document.activeElement), true, "j moves to the next visible X card");
  await page.keyboard.press("k");
  assert.equal(await panel.locator("article").first().evaluate((element) => element === document.activeElement), true, "k returns to the previous visible X card");
  assert.equal(await release.locator("details[data-story-details]").getAttribute("open"), "", "switching to saved sources preserves an explicitly opened story without remounting the feed");
  await openStoryDetails(release);

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    if (width < 1024) await page.getByRole("button", { name: "Jump to X column", exact: true }).click();
    const xColumn = page.getByRole("region", { name: "AI on X column", exact: true });
    await release.getByRole("button", { name: "Load post from X", exact: true }).evaluate((element) => {
      const scroller = element.closest(".feed-scroll");
      if (!scroller) return;
      const scrollerBounds = scroller.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      if (bounds.bottom > scrollerBounds.bottom) scroller.scrollTop += bounds.bottom - scrollerBounds.bottom;
      else if (bounds.top < scrollerBounds.top) scroller.scrollTop += bounds.top - scrollerBounds.top;
    });
    const layout = await page.evaluate(() => ({ bodyWidth: document.body.scrollWidth, innerWidth, rootX: window.scrollX, rootOverflowX: getComputedStyle(document.documentElement).overflowX }));
    assert.ok(layout.bodyWidth <= layout.innerWidth && layout.rootX === 0 && layout.rootOverflowX === "clip", `discovery fits ${width}px: ${JSON.stringify(layout)}`);
    const columnBounds = await xColumn.boundingBox();
    assert.ok(columnBounds.x >= -1 && columnBounds.x + columnBounds.width <= width + 1, `X column is visible at ${width}px`);
    for (const name of ["Load post from X", "Saved"]) {
      const bounds = await release.getByRole("button", { name, exact: true }).boundingBox();
      assert.ok(bounds && bounds.height >= 44 && bounds.width >= 44, `${name} meets touch target at ${width}`);
    }
    if ([390, 1440].includes(width)) {
      await xColumn.locator("[data-x-scroll]").evaluate((element) => { element.scrollTop = 0; });
      const headerBounds = await xColumn.locator(".col-header").boundingBox();
      const titleBounds = await release.getByRole("heading").boundingBox();
      assert.equal(headerBounds.height, 44, "X uses the standard 44px column header");
      assert.ok(titleBounds.y >= headerBounds.y + headerBounds.height && titleBounds.y - headerBounds.y < 200, `the first headline remains near the header at ${width}px`);
      await page.screenshot({ path: join(tmpdir(), `gcdsignal-x-discovery-${width}.png`) });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const previewButton = release.getByRole("button", { name: "Load post from X", exact: true });
  await previewButton.click();
  const dialog = page.getByRole("dialog", { name: "X post preview", exact: true });
  await dialog.locator('[data-qa-post="111"]').waitFor();
  assert.equal(state.external.length, 1);
  await dialog.getByRole("link", { name: "Open on X ↗", exact: true }).focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.tagName), "IFRAME", "keyboard can enter the embedded original post");
  await dialog.getByRole("button", { name: "Close X post preview", exact: true }).focus();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert.equal(await previewButton.evaluate((element) => element === document.activeElement), true, "closing preview restores focus");

  await refresh.click();
  assert.equal(state.requests.length, 1, "manual refresh honors five-minute cache");
  await panel.getByRole("button", { name: "Filter", exact: true }).click();
  await panel.getByRole("combobox", { name: "Shared within", exact: true }).selectOption("24");
  state.data = { ...state.data, items: [{ ...state.data.items[0], id: "444", url: "https://x.com/QaRelease/status/444", title: "New AI discovery after refresh", sharedAt: time(-7) }, ...state.data.items] };
  await page.evaluate(() => { window.__clockOffset += 7 * 3600_000; });
  await refresh.click();
  await panel.getByRole("button", { name: "Show updated discoveries", exact: true }).waitFor();
  assert.equal(await panel.getByRole("heading", { name: "New AI discovery after refresh", exact: true }).count(), 0, "new results wait for deliberate application");
  assert.equal(await panel.getByRole("heading", { name: "AI model release with a useful demo", exact: true }).count(), 1, "holding updates also holds the date cutoff so cards do not disappear");
  await panel.getByRole("button", { name: "Show updated discoveries", exact: true }).click();
  await panel.getByRole("heading", { name: "New AI discovery after refresh", exact: true }).waitFor();
  state.fail = true;
  await page.evaluate(() => { window.__clockOffset += 360_000; });
  await refresh.click();
  await panel.getByText(/Showing available discoveries; check source coverage/).waitFor();
  await column.locator('.col-header .led[aria-label="Status: stale"]').waitFor();
  assert.equal(await panel.locator("article").count(), 2, "an outage keeps already loaded cards");

  // A source can return useful stale content while a later refresh is running.
  // The health LED must not substitute for the independent request busy state.
  const healthyCoverage = state.data.health;
  state.fail = false;
  state.data = { ...state.data, stale: true, health: { ...healthyCoverage, degraded: true, succeeded: 1, failed: 1 } };
  await page.evaluate(() => { window.__clockOffset += 360_000; });
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === "/api/feeds/x-discovery"),
    refresh.click(),
  ]);
  await page.waitForFunction(() => document.querySelector('button[aria-label="Refresh AI on X"]')?.getAttribute("aria-busy") === "false");
  await column.locator('.col-header .led[aria-label="Status: stale"]').waitFor();
  let releaseResponse;
  state.delay = new Promise((resolve) => { releaseResponse = resolve; });
  try {
    await page.evaluate(() => { window.__clockOffset += 360_000; });
    await Promise.all([
      page.waitForRequest((request) => new URL(request.url()).pathname === "/api/feeds/x-discovery"),
      refresh.click(),
    ]);
    await page.waitForFunction(() => document.querySelector('button[aria-label="Refresh AI on X"]')?.getAttribute("aria-busy") === "true");
    assert.equal(await refresh.isDisabled(), true, "a delayed refresh is disabled even with stale source health");
    assert.equal(await refresh.locator("svg.animate-spin").count(), 1, "stale refresh still shows its busy spinner");
    await column.locator('.col-header .led[aria-label="Status: stale"]').waitFor();
    const requestCount = state.requests.length;
    await refresh.evaluate((element) => element.click());
    assert.equal(state.requests.length, requestCount, "a disabled refresh cannot start a second request");
    state.data = { ...state.data, stale: false, health: healthyCoverage };
  } finally {
    state.delay = null;
    releaseResponse();
  }
  await column.locator('.col-header .led[aria-label="Status: ok"]').waitFor();
  await page.waitForFunction(() => document.querySelector('button[aria-label="Refresh AI on X"]')?.getAttribute("aria-busy") === "false");
  assert.equal(await refresh.isEnabled(), true, "completed refresh becomes available again");
  await context.close();

  const blocked = await setup({ blockWidgets: true, blockStorage: true });
  const first = blocked.panel.locator("article").first();
  await openStoryDetails(first);
  await first.getByRole("button", { name: "Save post", exact: true }).click();
  await blocked.page.getByRole("region", { name: "AI on X column", exact: true }).getByRole("alert").waitFor();
  await first.getByRole("button", { name: "Load post from X", exact: true }).click();
  const blockedDialog = blocked.page.getByRole("dialog", { name: "X post preview", exact: true });
  await blockedDialog.getByText(/X could not display this post/).waitFor();
  assert.equal(await blockedDialog.getByRole("link", { name: "Open on X ↗", exact: true }).getAttribute("href"), "https://x.com/QaRelease/status/111");
  await blockedDialog.getByRole("button", { name: "Retry post", exact: true }).click();
  await blockedDialog.getByText(/X could not display this post/).waitFor();
  assert.equal(blocked.state.external.length, 2, "blocked widgets can be retried");
  await blocked.context.close();

  const empty = await setup({ empty: true });
  await empty.panel.getByRole("heading", { name: "No discoveries match this view yet", exact: true }).waitFor();
  assert.deepEqual(empty.state.external, []);
  await empty.context.close();
  assert.deepEqual(errors, [], "no client runtime errors");
  console.log("PASS: automatic discovery, collapsed Details with labeled HN comments, compact column header/controls, dates/order/search, saving, 320–1440px layout, click-to-load preview/focus, cache/update stability, independent source-status/busy indicators, delayed stale retry, blocked storage/widgets and empty/outage states.");
} finally { await browser.close(); }
