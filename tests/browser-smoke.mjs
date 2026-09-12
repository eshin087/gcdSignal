// Optional real-browser regression against a local build only; all APIs/X are mocked.
// APP_URL=http://127.0.0.1:3001 PLAYWRIGHT_PATH=<existing install> node tests/browser-smoke.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const appUrl = process.env.APP_URL || "http://127.0.0.1:3001";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(appUrl).hostname), "tests only run against a local server");
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "chrome" });
const errors = [];
const requests = [];
const external = [];
let generation = 0;
const hidden = ["top10", "github", "papers", "fourchan"];
const now = () => new Date().toISOString();
const health = (all = false) => ({ total: all ? 5 : 2, succeeded: all ? 4 : 2, failed: all ? 1 : 0, degraded: all, details: [
  { id: "Primary newsroom", status: "ok", checkedAt: now(), lastSuccessAt: now() },
  ...(all ? [{ id: "YouTube", status: "error", checkedAt: now(), message: "QA upstream unavailable" }] : []),
] });
function storyItem(source, i, category = "trending", gen = generation) {
  const topic = category === "research" ? "AI research evaluation" : category === "security" ? "AI safety regulation" : "AI compute contract";
  return {
    id: `${source}-${gen}-${i}`, source,
    title: `${topic}: QA budget-${gen}-${i} independent reporting`,
    url: `https://${source}.example/news/${gen}/${i}`,
    timestamp: new Date(Date.now() - i * 1800000).toISOString(),
    author: "qa-author", sourceMeta: source === "reddit" ? "r/LocalLLaMA" : `QA ${source}`,
    excerpt: `Independent reporting about an AI company's ${category === "research" ? "research study and evaluation" : category === "security" ? "safety regulation and privacy" : "compute contract and investment"}. This attributed excerpt is deliberately not a developer tutorial.`,
    curation: { kind: category === "research" ? "Research" : category === "security" ? "Security" : "News", topics: [category === "trending" ? "industry" : category], reasons: ["Recent reporting"], builder: false, substantive: true },
  };
}
function briefFixture(url) {
  const all = url.searchParams.get("phase") === "all";
  const category = url.searchParams.get("category") || "trending";
  return {
    schemaVersion: 2, phase: all ? "all" : "primary", windowHours: Number(url.searchParams.get("window")), fetchedAt: now(), health: health(all),
    top10: Array.from({ length: 10 }, (_, i) => {
      const item = storyItem("rss", i, category);
      const discussion = { ...item, id: "hn-" + item.id, source: "hackernews", url: `https://news.ycombinator.com/item?id=${generation}000${i}`, externalUrl: item.url };
      return { id: `qa-story-${generation}-${i}`, title: item.title, url: item.url, sources: all ? ["rss", "hackernews"] : ["rss"], timestamp: item.timestamp, firstPublishedAt: item.timestamp, members: all ? [item, discussion] : [item], publishers: ["rss.example"], platforms: all ? ["hackernews"] : [], reasons: ["Recent substantive reporting", "One reporting publisher; social links are additional circulation"] };
    }),
  };
}
async function setup(prefs) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", colorScheme: "light" });
  if (prefs) await context.addInitScript((value) => {
    if (!sessionStorage.getItem("qa-seeded")) { localStorage.setItem("gcdsignal:prefs", JSON.stringify(value)); sessionStorage.setItem("qa-seeded", "1"); }
  }, prefs);
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(appUrl).origin) { external.push(url.href); return route.abort(); }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    requests.push(url.href);
    if (url.pathname === "/api/brief") return route.fulfill({ json: briefFixture(url) });
    if (url.pathname === "/api/feeds/x-discovery") return route.fulfill({ json: {
      schemaVersion: 1, fetchedAt: now(), health: health(), items: [{
        id: "1234567890", url: "https://x.com/QaResearch/status/1234567890", author: "QaResearch", title: "AI model release from public coverage", sharedAt: now(), rank: 500,
        excerpt: "Public source context about this AI model announcement. This intentionally long attributed excerpt checks the same two-line preview and compact-density behavior as the other news columns.",
        reasons: ["Shared on Hacker News"], mentions: [{ source: "hackernews", sourceUrl: "https://news.ycombinator.com/item?id=101", sourceTitle: "AI model release from public coverage", sharedAt: now(), points: 80, comments: 12 }],
      }],
    } });
    const source = url.pathname.split("/").at(-1);
    if (source === "bluesky") return route.fulfill({ json: { schemaVersion: 2, source, items: [], error: "QA upstream unavailable", fetchedAt: now(), health: { total: 1, failed: 1, succeeded: 0, degraded: true } } });
    return route.fulfill({ json: { schemaVersion: 2, source, fetchedAt: now(), health: health(), items: Array.from({ length: 35 }, (_, i) => storyItem(source, i, url.searchParams.get("category") || "trending")) } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page };
}
async function settings(page, open) {
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  if (open) {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await dialog.waitFor();
  } else {
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
  }
  return dialog;
}
async function touchTarget(locator, label) {
  await locator.scrollIntoViewIfNeeded();
  const bounds = await locator.boundingBox();
  assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44, `${label} has a 44px touch target`);
}
async function mainNav(page, name) { await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name, exact: true }).click(); }
async function dbRecords(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("gcdsignal:library", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => { const request = open.result.transaction("records").objectStore("records").getAll(); request.onsuccess = () => { resolve(request.result); open.result.close(); }; request.onerror = () => reject(request.error); };
  }));
}
async function matchingXColumn(page, { compact = false, label = "default" } = {}) {
  const rss = page.locator('[data-feed-id="rss"]');
  const x = page.getByRole("region", { name: "AI on X column", exact: true });
  const rssCard = rss.locator("article").first();
  const xCard = x.locator("article").first();
  await rssCard.waitFor();
  await xCard.waitFor();
  // Compare actual computed styles, not class names that can drift independently.
  const styles = (locator, properties) => locator.evaluate((element, keys) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(keys.map((key) => [key, style.getPropertyValue(key)]));
  }, properties);
  const rssShell = rss.locator("section").first();
  assert.deepEqual(await styles(x, ["background-color", "border-radius", "box-shadow"]), await styles(rssShell, ["background-color", "border-radius", "box-shadow"]), `${label}: X shares the standard column surface`);
  const xHeader = x.locator(".col-header");
  const rssHeader = rss.locator(".col-header");
  assert.deepEqual(await styles(xHeader, ["height", "padding-left", "padding-right", "border-bottom-color"]), await styles(rssHeader, ["height", "padding-left", "padding-right", "border-bottom-color"]), `${label}: column headers align`);
  assert.equal((await xHeader.boundingBox()).height, 44, `${label}: X has the standard 44px header`);
  assert.deepEqual(await styles(xHeader.locator("h2"), ["font-family", "font-size", "font-weight", "text-transform", "color"]), await styles(rssHeader.locator("h2"), ["font-family", "font-size", "font-weight", "text-transform", "color"]), `${label}: column heading typography matches`);
  await xHeader.locator('.led[aria-label="Status: ok"]').waitFor();
  assert.equal(await xHeader.locator(".rounded-full").count(), 1, `${label}: X has a standard count badge`);
  assert.equal(await xHeader.getByRole("button", { name: "Refresh AI on X", exact: true }).locator("svg").count(), 1, `${label}: refresh is an icon in the header`);
  const accent = await xHeader.evaluate((element) => { const style = getComputedStyle(element.previousElementSibling); return { height: style.height, background: style.backgroundImage }; });
  assert.equal(accent.height, "2px", `${label}: X has the same thin accent strip`);
  assert.notEqual(accent.background, "none");
  assert.deepEqual(await styles(xCard, ["padding-top", "padding-bottom", "padding-left", "padding-right", "border-radius", "border-bottom-color"]), await styles(rssCard, ["padding-top", "padding-bottom", "padding-left", "padding-right", "border-radius", "border-bottom-color"]), `${label}: feed row spacing and separators match`);
  const xTitle = xCard.getByRole("heading").locator("a");
  const rssTitle = rssCard.locator("a").first();
  const titleStyle = await styles(xTitle, ["font-size", "font-weight", "line-height", "letter-spacing", "color"]);
  assert.deepEqual(titleStyle, await styles(rssTitle, ["font-size", "font-weight", "line-height", "letter-spacing", "color"]), `${label}: X uses the same headline scale and weight`);
  const excerpts = xCard.locator("p.line-clamp-2");
  assert.equal(await excerpts.count(), compact ? 0 : 1, `${label}: X respects the shared density setting`);
  if (!compact) assert.deepEqual(await styles(excerpts, ["font-size", "line-height", "-webkit-line-clamp", "color"]), await styles(rssCard.locator("p.line-clamp-2"), ["font-size", "line-height", "-webkit-line-clamp", "color"]), `${label}: excerpts share the two-line preview style`);
  await x.locator("[data-x-scroll]").evaluate((element) => { element.scrollTop = 0; });
  const titleBounds = await xTitle.boundingBox();
  const headerBounds = await xHeader.boundingBox();
  assert.ok(titleBounds.y >= headerBounds.y + headerBounds.height && titleBounds.y - headerBounds.y < 200, `${label}: headlines are not pushed down by introductory controls`);
  return { fontSize: Number.parseFloat(titleStyle["font-size"]), padding: Number.parseFloat((await styles(xCard, ["padding-top"]))["padding-top"]), color: titleStyle.color };
}
try {
  const { context, page } = await setup();
  await page.goto(appUrl);
  await page.getByRole("heading", { name: "The essential Brief", exact: true }).waitFor();
  await page.locator("main article").nth(9).waitFor();
  const homeX = page.getByRole("region", { name: "AI on X column", exact: true });
  await homeX.getByRole("region", { name: "X discoveries", exact: true }).waitFor();
  await homeX.getByRole("heading", { name: "AI model release from public coverage", exact: true }).waitFor();
  assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "X", exact: true }).count(), 0, "X is a home column, not a separate navigation destination");
  assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button").count(), 3, "main navigation contains only Brief, Deck and Library");
  assert.ok(requests.some((request) => new URL(request).pathname === "/api/feeds/x-discovery"), "the default homepage automatically requests X discoveries");
  assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Brief", exact: true }).getAttribute("aria-current"), "page");
  assert.equal(await page.locator("main article").count(), 10, "all ten non-builder news stories remain visible by default");
  await page.getByText("Partial coverage", { exact: true }).waitFor();
  await page.locator(".coverage-panel summary").click();
  await page.getByText("QA upstream unavailable", { exact: true }).waitFor();
  await page.locator(".coverage-panel summary").click();
  assert.ok(requests.some((request) => request.includes("phase=primary") && request.includes("window=24")));
  assert.ok(requests.some((request) => request.includes("phase=all") && request.includes("window=24")));
  assert.equal(external.filter((url) => /(?:twitter|x)\.com/.test(url)).length, 0);
  for (const width of [320, 360, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const trigger = page.getByRole("button", { name: "Settings", exact: true });
    await touchTarget(trigger, `Settings at ${width}`);
    const bounds = await trigger.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `Settings fits at ${width}`);
    const logo = await page.getByRole("button", { name: "Signal home", exact: true }).boundingBox();
    assert.ok(Math.abs(bounds.y - logo.y) < 2, `Settings stays in the first row at ${width}`);
    assert.equal(await trigger.locator("svg").count(), 1, "Settings has a visible gear icon");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no document overflow at ${width}`);
    if (width < 1024) {
      const jumpX = page.getByRole("button", { name: "Jump to X column", exact: true });
      await touchTarget(jumpX, `Jump to X at ${width}`);
      await jumpX.click();
      await page.waitForFunction(() => { const column = document.querySelector('[data-feed-id="x-discovery"]'); const bounds = column?.getBoundingClientRect(); return bounds && bounds.left >= -1 && bounds.right <= innerWidth + 1; });
      assert.equal(await page.evaluate(() => document.activeElement.id), "home-x", "the X jump transfers keyboard focus to its column");
      await page.getByRole("button", { name: "Jump to Brief column", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('main[aria-label="Essential Brief"]').getBoundingClientRect().left >= -1);
      assert.equal(await page.evaluate(() => document.activeElement.id), "home-brief", "the Brief jump transfers keyboard focus to its column");
    } else {
      const briefBounds = await page.getByRole("main", { name: "Essential Brief", exact: true }).boundingBox();
      const xBounds = await homeX.boundingBox();
      assert.ok(briefBounds.x >= 0 && xBounds.x >= briefBounds.x + briefBounds.width - 1 && xBounds.x + xBounds.width <= width + 1, "Brief and X are visible side by side on desktop");
      assert.ok(xBounds.width >= 340 && xBounds.width <= 420, "desktop X remains a readable column");
    }
    assert.equal(await page.getByRole("main", { name: "Essential Brief", exact: true }).getByRole("button", { name: "Refresh", exact: true }).count(), 1, `exactly one visible Brief refresh at ${width}`);
    const headerBefore = await page.locator(".reader-header").boundingBox();
    const drawer = await settings(page, true);
    assert.equal(await page.getByRole("dialog").count(), 1, "one Settings click opens one dialog");
    assert.deepEqual(await page.locator(".reader-header").boundingBox(), headerBefore, `Settings does not shift the header at ${width}`);
    const drawerBounds = await drawer.boundingBox();
    assert.ok(drawerBounds.x >= 0 && drawerBounds.x + drawerBounds.width <= width + 1, `Settings fits the viewport at ${width}`);
    assert.ok(drawerBounds.height > drawerBounds.width, `Settings stays a vertical panel at ${width}`);
    assert.ok(await drawer.evaluate((element) => element.scrollWidth <= element.clientWidth), `Settings has no horizontal overflow at ${width}`);
    await touchTarget(drawer.getByRole("button", { name: "Close settings", exact: true }), `Close settings at ${width}`);
    if (width === 390 || width === 1440) await page.screenshot({ path: join(tmpdir(), `gcdsignal-settings-${width === 390 ? "mobile" : "desktop"}-qa.png`) });
    await settings(page, false);
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Settings", "closing Settings returns focus to its gear");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const container = document.querySelector(".home-columns");
    const briefVisible = container.scrollLeft < container.clientWidth / 2;
    return document.querySelector('[aria-label="Jump to Brief column"]').getAttribute("aria-pressed") === String(briefVisible)
      && document.querySelector('[aria-label="Jump to X column"]').getAttribute("aria-pressed") === String(!briefVisible);
  });
  await page.getByRole("button", { name: "Jump to Brief column", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Jump to Brief column"]').getAttribute("aria-pressed") === "true");
  assert.equal(await page.getByRole("button", { name: "Jump to X column", exact: true }).getAttribute("aria-pressed"), "false", "jumping after resize highlights the visible Brief column");
  await page.screenshot({ path: join(tmpdir(), "gcdsignal-mobile-qa.png") });
  const firstHeadlineY = (await page.locator("main article h2").first().boundingBox()).y;
  assert.ok(firstHeadlineY < 500, `first mobile headline is above the 500px mark (actual ${firstHeadlineY})`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: join(tmpdir(), "gcdsignal-desktop-qa.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("main", { name: "Essential Brief" }).evaluate((element) => { element.scrollTop = 700; });
  assert.equal((await dbRecords(page)).filter((record) => record.readAt).length, 0, "scrolling never marks stories read");
  await page.getByRole("main", { name: "Essential Brief" }).evaluate((element) => { element.scrollTop = 0; });
  const first = page.locator("main article").first();
  await first.getByRole("button", { name: "Save story", exact: true }).click();
  await first.getByRole("button", { name: "Remove from saved", exact: true }).waitFor();
  await first.getByRole("button", { name: "Mark read", exact: true }).click();
  await first.getByRole("button", { name: "Mark unread", exact: true }).waitFor();
  await first.getByRole("button", { name: "Sources & discussion", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Close story", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  const drawer = await settings(page, true);
  assert.equal(await drawer.getByRole("button", { name: "Broad", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await drawer.getByRole("checkbox", { name: "Show Bluesky", exact: true }).isChecked(), false, "Bluesky starts disabled");
  assert.equal(await drawer.getByRole("checkbox", { name: "Show AI on X", exact: true }).isChecked(), true, "X starts enabled as a column");
  for (const name of ["Small", "Medium", "Large", "Largest", "Comfortable", "Compact", "Broad", "Builder"]) {
    await touchTarget(drawer.getByRole("button", { name, exact: true }), name);
  }
  for (const name of ["Auto-refresh", "Deck sorting"]) {
    const control = drawer.getByRole("combobox", { name, exact: true });
    assert.equal(await control.evaluate((element) => element.tagName), "SELECT", `${name} uses an accessible native select`);
    await touchTarget(control, name);
  }
  await touchTarget(drawer.getByRole("checkbox", { name: "Show Bluesky", exact: true }).locator(".."), "Bluesky source label");
  await drawer.getByRole("button", { name: "Large", exact: true }).click();
  assert.equal(await page.locator("html").getAttribute("data-text"), "lg", "text size applies immediately");
  await drawer.getByRole("button", { name: "Medium", exact: true }).click();
  const longTerm = "A".repeat(80);
  await drawer.getByRole("textbox", { name: "Follow a company or product", exact: true }).fill(longTerm);
  await drawer.getByRole("button", { name: "Follow", exact: true }).click();
  assert.ok(await drawer.locator(".feed-scroll").evaluate((element) => element.scrollWidth <= element.clientWidth), "long followed terms wrap inside Settings");
  await drawer.getByRole("button", { name: "Unfollow " + longTerm, exact: true }).click();
  await drawer.getByRole("combobox", { name: "Auto-refresh", exact: true }).selectOption("0");
  await drawer.getByRole("combobox", { name: "Deck sorting", exact: true }).selectOption("new");
  await drawer.getByRole("button", { name: "Close settings", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  assert.ok(await page.evaluate(() => !!document.activeElement.closest("dialog")), "settings wraps keyboard focus");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Settings");
  const reopened = await settings(page, true);
  assert.equal(await reopened.getByRole("combobox", { name: "Auto-refresh", exact: true }).inputValue(), "0");
  assert.equal(await reopened.getByRole("combobox", { name: "Deck sorting", exact: true }).inputValue(), "new");
  await settings(page, false);

  await page.getByRole("button", { name: "Expand to the last 72 hours", exact: true }).click();
  await page.locator("main .reader-eyebrow").filter({ hasText: "72h" }).waitFor();
  await page.getByRole("navigation", { name: "AI category" }).getByRole("button", { name: "Research", exact: true }).click();
  await page.locator("main article").first().filter({ hasText: "AI research evaluation" }).waitFor();
  assert.ok(requests.some((request) => request.includes("category=research") && request.includes("window=72")));
  await page.getByRole("navigation", { name: "AI category" }).getByRole("button", { name: "All AI", exact: true }).click();
  await page.getByRole("button", { name: "Return to the last 24 hours", exact: true }).click();
  await page.locator("main .reader-eyebrow").filter({ hasText: "24h" }).waitFor();

  await page.getByRole("searchbox", { name: "Search your collection", exact: true }).first().fill("budget-0-0");
  const library = page.getByRole("region", { name: "Research library", exact: true });
  await library.getByRole("heading", { name: "Your research library", exact: true }).waitFor();
  await library.getByLabel("Saved", { exact: true }).check();
  const savedArticle = library.locator("article").first();
  await savedArticle.getByRole("button", { name: "Unsave", exact: true }).waitFor();
  await savedArticle.locator("summary").click();
  await savedArticle.getByLabel("Collection", { exact: true }).fill("Work AI");
  await savedArticle.getByLabel("Personal note", { exact: true }).fill("Review this budget for the planning meeting");
  // A remote saved-field update must not remount the editor and erase a draft.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("gcdsignal:library", 1); open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const transaction = open.result.transaction("records", "readwrite"), store = transaction.objectStore("records"), read = store.getAll();
      read.onsuccess = () => { const record = read.result.find((entry) => entry.savedAt && entry.item.title.includes("budget-0-0")); store.put({ ...record, collection: "Remote shelf" }); };
      transaction.oncomplete = () => { const channel = new BroadcastChannel("gcdsignal:library"); channel.postMessage("changed"); channel.close(); open.result.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
  await savedArticle.getByText("Collection: Remote shelf", { exact: true }).waitFor();
  assert.equal(await savedArticle.getByLabel("Personal note", { exact: true }).inputValue(), "Review this budget for the planning meeting", "remote updates preserve a local unsaved note");
  assert.equal(await savedArticle.getByLabel("Collection", { exact: true }).inputValue(), "Work AI", "remote updates preserve a local unsaved collection");
  await savedArticle.getByRole("button", { name: "Save note & collection", exact: true }).click();
  await savedArticle.getByText("Collection: Work AI · Has note", { exact: true }).waitFor();
  await page.waitForFunction(() => new Promise((resolve) => {
    const open = indexedDB.open("gcdsignal:library", 1); open.onsuccess = () => { const read = open.result.transaction("records").objectStore("records").getAll(); read.onsuccess = () => { resolve(read.result.some((record) => record.note === "Review this budget for the planning meeting" && record.savedAt && record.readAt)); open.result.close(); }; };
  }));
  await page.reload();
  await page.getByRole("heading", { name: "Your research library", exact: true }).waitFor();
  await page.getByRole("searchbox", { name: "Search your collection", exact: true }).first().fill("planning meeting");
  await page.getByRole("region", { name: "Research library", exact: true }).getByText("Collection: Work AI · Has note", { exact: true }).waitFor();
  assert.equal(await page.getByRole("region", { name: "Research library", exact: true }).locator("article").count(), 1, "personal notes are searchable after reload");

  await mainNav(page, "Deck");
  await page.locator('[data-feed-id="x-discovery"]').waitFor();
  const deckIds = await page.locator(".deck-scroll [data-feed-id]").evaluateAll((elements) => elements.map((element) => element.dataset.feedId));
  assert.equal(deckIds.indexOf("x-discovery"), deckIds.indexOf("rss") + 1, "the default Deck puts X beside RSS");
  await page.setViewportSize({ width: 1440, height: 844 });
  await page.mouse.move(0, 0);
  const comfortableStyle = await matchingXColumn(page);
  await page.screenshot({ path: join(tmpdir(), "gcdsignal-x-deck-comfortable-light.png") });
  const originalDark = await page.locator("html").evaluate((element) => element.classList.contains("dark"));
  const styleSettings = await settings(page, true);
  await styleSettings.getByRole("button", { name: originalDark ? "Switch to light mode" : "Switch to dark mode", exact: true }).click();
  await styleSettings.getByRole("button", { name: "Compact", exact: true }).click();
  await settings(page, false);
  const compactStyle = await matchingXColumn(page, { compact: true, label: "opposite theme / compact" });
  assert.ok(compactStyle.padding < comfortableStyle.padding, "compact X rows reduce vertical padding");
  assert.notEqual(compactStyle.color, comfortableStyle.color, "X headlines follow light/dark theme changes");
  await page.screenshot({ path: join(tmpdir(), "gcdsignal-x-deck-compact-dark.png") });
  let previousSize = 0;
  for (const textSize of ["Small", "Medium", "Large", "Largest"]) {
    const textSettings = await settings(page, true);
    await textSettings.getByRole("button", { name: textSize, exact: true }).click();
    await settings(page, false);
    const style = await matchingXColumn(page, { compact: true, label: `${textSize} text / compact` });
    assert.ok(style.fontSize > previousSize, `${textSize}: X headline size increases with the shared preference`);
    previousSize = style.fontSize;
  }
  await page.screenshot({ path: join(tmpdir(), "gcdsignal-x-matched-columns-qa.png") });
  const restoreStyle = await settings(page, true);
  await restoreStyle.getByRole("button", { name: "Medium", exact: true }).click();
  await restoreStyle.getByRole("button", { name: "Comfortable", exact: true }).click();
  await restoreStyle.getByRole("button", { name: originalDark ? "Switch to dark mode" : "Switch to light mode", exact: true }).click();
  await settings(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Focus Reddit ↗", exact: true }).waitFor();
  await page.locator('[data-feed-id="reddit"] article').first().waitFor();
  await page.getByRole("button", { name: "Focus Reddit ↗", exact: true }).scrollIntoViewIfNeeded();
  const deckLeft = await page.locator(".deck-scroll").evaluate((element) => element.scrollLeft);
  await page.getByRole("button", { name: "Focus Reddit ↗", exact: true }).click();
  assert.equal(await page.locator("[data-feed-id]:visible").count(), 1);
  await page.getByRole("button", { name: "← Back to deck", exact: true }).click();
  await page.getByRole("button", { name: "Focus Reddit ↗", exact: true }).waitFor();
  assert.ok(Math.abs(await page.locator(".deck-scroll").evaluate((element) => element.scrollLeft) - deckLeft) <= 1, "focus exit restores deck position");
  await page.getByRole("button", { name: "Focus AI on X ↗", exact: true }).click();
  assert.deepEqual(await page.locator("[data-feed-id]:visible").evaluateAll((elements) => elements.map((element) => element.dataset.feedId)), ["x-discovery"], "Deck focus isolates the X column");
  await page.getByRole("region", { name: "AI on X column", exact: true }).getByRole("heading", { name: "AI model release from public coverage", exact: true }).waitFor();
  await page.getByRole("button", { name: "← Back to deck", exact: true }).click();
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Command palette", exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Command", exact: true }).fill("text size");
  await page.keyboard.press("Tab");
  assert.ok(await page.evaluate(() => !!document.activeElement.closest("dialog")));
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await mainNav(page, "Brief");
  const xPanel = page.getByRole("region", { name: "AI on X column", exact: true });
  await xPanel.waitFor();
  const hideX = await settings(page, true);
  await hideX.getByRole("checkbox", { name: "Show AI on X", exact: true }).uncheck();
  await settings(page, false);
  assert.equal(await xPanel.count(), 0, "hiding X removes it from the homepage");
  await mainNav(page, "Deck");
  assert.equal(await page.locator('[data-feed-id="x-discovery"]').count(), 0, "the same visibility choice hides the Deck column");
  await mainNav(page, "Brief");
  await page.reload();
  await page.getByRole("heading", { name: "The essential Brief", exact: true }).waitFor();
  assert.equal(await xPanel.count(), 0, "the hidden X choice survives reload");
  const showX = await settings(page, true);
  assert.equal(await showX.getByRole("checkbox", { name: "Show AI on X", exact: true }).isChecked(), false);
  await showX.getByRole("checkbox", { name: "Show AI on X", exact: true }).check();
  await settings(page, false);
  await page.getByRole("button", { name: "Jump to X column", exact: true }).click();
  await xPanel.getByRole("region", { name: "X discoveries", exact: true }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0, "X is inline, not a separate page or dialog");
  assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Brief", exact: true }).getAttribute("aria-current"), "page");
  assert.equal(await xPanel.getByRole("button", { name: "Saved sources", exact: true }).getAttribute("aria-pressed"), "false", "the X column starts with automatic discovery");
  await xPanel.getByRole("button", { name: "Saved sources", exact: true }).click();
  await xPanel.getByRole("heading", { name: "Build your X reading space", exact: true }).waitFor();
  await xPanel.getByRole("button", { name: "Add your first source", exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement.id), "x-link-input", "X onboarding focuses the source field");
  await xPanel.getByRole("textbox", { name: "Add an account or link", exact: true }).fill("https://x.com/i/lists/123456789");
  await xPanel.getByRole("button", { name: "Save source", exact: true }).click();
  await xPanel.getByRole("button", { name: "Load embed", exact: true }).waitFor();
  assert.equal(await xPanel.getByRole("link", { name: "Open on X ↗", exact: true }).getAttribute("href"), "https://x.com/i/lists/123456789", "Open on X is available before consent");
  assert.equal(external.filter((url) => /(?:twitter|x)\.com/.test(url)).length, 0, "X stays unrequested until explicit consent");
  for (const width of [320, 360, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `X has no document overflow at ${width}`);
    await touchTarget(xPanel.getByRole("button", { name: "Load embed", exact: true }), `X consent at ${width}`);
    if (width === 390 || width === 1440) {
      await xPanel.locator("[data-x-scroll]").evaluate((element) => { element.scrollTop = 0; });
      await page.screenshot({ path: join(tmpdir(), `gcdsignal-x-${width === 390 ? "mobile" : "desktop"}-qa.png`) });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await xPanel.getByRole("button", { name: "Load embed", exact: true }).click();
  await xPanel.getByText("X could not display this source", { exact: true }).waitFor();
  assert.ok(external.some((url) => url === "https://platform.twitter.com/widgets.js"));
  assert.equal(await xPanel.getByRole("link", { name: "Open on X ↗", exact: true }).getAttribute("href"), "https://x.com/i/lists/123456789");
  const attempts = external.filter((url) => url === "https://platform.twitter.com/widgets.js").length;
  await xPanel.getByRole("button", { name: "Retry embed", exact: true }).click();
  await xPanel.getByText("X could not display this source", { exact: true }).waitFor();
  assert.equal(external.filter((url) => url === "https://platform.twitter.com/widgets.js").length, attempts + 1, "a blocked widget can be retried");
  await xPanel.getByRole("textbox", { name: "Add an account or link", exact: true }).fill("@OpenAI");
  await xPanel.getByRole("button", { name: "Save source", exact: true }).click();
  await xPanel.getByRole("button", { name: "Load embed", exact: true }).waitFor();
  assert.equal(await xPanel.getByRole("link", { name: "Open on X ↗", exact: true }).getAttribute("href"), "https://x.com/OpenAI", "X accepts a simple account handle");
  assert.equal(external.filter((url) => url === "https://platform.twitter.com/widgets.js").length, attempts + 1, "choosing another account requires fresh consent");
  await page.reload();
  await page.getByRole("button", { name: "Jump to X column", exact: true }).click();
  await xPanel.getByRole("button", { name: "Saved sources", exact: true }).click();
  await xPanel.getByRole("button", { name: "Load embed", exact: true }).waitFor();
  assert.equal(await xPanel.getByRole("link", { name: "Open on X ↗", exact: true }).getAttribute("href"), "https://x.com/i/lists/123456789", "saved X sources survive reload");
  assert.equal(external.filter((url) => url === "https://platform.twitter.com/widgets.js").length, attempts + 1, "restoring an X source does not load it automatically");
  assert.ok(!requests.some((request) => new URL(request).pathname === "/api/feeds/bluesky"), "default Brief, Deck and Library do not request Bluesky");
  await context.close();

  for (const version of [6, 7]) {
    const migration = await setup({ v: version, view: version === 6 ? "foryou" : "brief", contentMode: "builder", hidden, refreshMs: 0, followedTopics: ["research"], density: "compact", textScale: "lg" });
    await migration.page.goto(appUrl);
    await migration.page.getByRole("heading", { name: "The essential Brief", exact: true }).waitFor();
    const migratedSettings = await settings(migration.page, true);
    assert.equal(await migratedSettings.getByRole("button", { name: version === 6 ? "Broad" : "Builder", exact: true }).getAttribute("aria-pressed"), "true", `v${version} content-mode migration`);
    assert.equal(await migratedSettings.getByRole("checkbox", { name: "Show Bluesky", exact: true }).isChecked(), false, `v${version} disables Bluesky`);
    assert.equal(await migration.page.locator("html").getAttribute("data-text"), "lg", "migration preserves display preference");
    await settings(migration.page, false);
    if (version === 6) await migration.page.locator("main article").nth(9).waitFor();
    else await migration.page.getByText("Builder filter is on.", { exact: false }).waitFor();
    await migration.context.close();
  }

  const held = await setup({ v: 7, view: "brief", contentMode: "broad", hidden, refreshMs: 300000 });
  await held.page.clock.install();
  await held.page.goto(appUrl);
  await held.page.locator("main article").nth(9).waitFor();
  await held.page.getByText("Partial coverage", { exact: true }).waitFor();
  const scroll = held.page.getByRole("main", { name: "Essential Brief", exact: true });
  await scroll.evaluate((element) => { element.scrollTop = 600; });
  const before = await held.page.locator("main article").first().getAttribute("data-item-key");
  generation++;
  await held.page.clock.fastForward(301000);
  const pending = held.page.getByRole("button", { name: "New coverage available · Update brief", exact: true });
  await pending.waitFor();
  assert.equal(await held.page.locator("main article").first().getAttribute("data-item-key"), before, "polling does not replace a scrolled reading list");
  assert.ok(await scroll.evaluate((element) => element.scrollTop > 400), "reading position survives refresh");
  await pending.click();
  await held.page.clock.runFor(100);
  assert.notEqual(await held.page.locator("main article").first().getAttribute("data-item-key"), before, "new coverage applies only when requested");
  assert.equal(await scroll.evaluate((element) => element.scrollTop), 0);
  await held.context.close();
  assert.deepEqual(errors, [], "no client runtime errors");
  console.log("PASS: Brief/Broad and X home-column defaults, opt-in Bluesky, preference migrations, coverage, window/category requests, explicit read/save, library search/notes/reload, 320–1440px layouts, mobile column jumps, desktop side-by-side columns, matching X/RSS column and row styles, light/dark themes, all text scales and compact density, X hide/show/reload, one-click Settings gear/drawer, touch targets, settings controls/focus, deck focus, X consent/retry/fallback/reload, held refresh.");
  console.log("Screenshots: " + join(tmpdir(), "gcdsignal-mobile-qa.png") + " and " + join(tmpdir(), "gcdsignal-desktop-qa.png"));
  console.log("Settings and X screenshots: " + ["settings-mobile", "settings-desktop", "x-mobile", "x-desktop"].map((name) => join(tmpdir(), `gcdsignal-${name}-qa.png`)).join(", "));
} finally { await browser.close(); }
