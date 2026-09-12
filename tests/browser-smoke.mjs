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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  if (prefs) await context.addInitScript((value) => {
    if (!sessionStorage.getItem("qa-seeded")) { localStorage.setItem("gcdsignal:prefs", JSON.stringify(value)); sessionStorage.setItem("qa-seeded", "1"); }
  }, prefs);
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(appUrl).origin) { external.push(url.href); return route.abort(); }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    requests.push(url.href);
    if (url.pathname === "/api/brief") return route.fulfill({ json: briefFixture(url) });
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
try {
  const { context, page } = await setup();
  await page.goto(appUrl);
  await page.getByRole("heading", { name: "The essential Brief", exact: true }).waitFor();
  await page.locator("main article").nth(9).waitFor();
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
  assert.ok((await page.locator("main article h2").first().boundingBox()).y < 500, "first mobile headline is above the 500px mark");
  await page.screenshot({ path: join(tmpdir(), "gcdsignal-mobile-qa.png") });
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
  await page.getByRole("button", { name: "Focus Reddit ↗", exact: true }).waitFor();
  await page.locator('[data-feed-id="reddit"] article').first().waitFor();
  await page.getByRole("button", { name: "Focus Reddit ↗", exact: true }).scrollIntoViewIfNeeded();
  const deckLeft = await page.locator(".deck-scroll").evaluate((element) => element.scrollLeft);
  await page.getByRole("button", { name: "Focus Reddit ↗", exact: true }).click();
  assert.equal(await page.locator("[data-feed-id]:visible").count(), 1);
  await page.getByRole("button", { name: "← Back to deck", exact: true }).click();
  await page.getByRole("button", { name: "Focus Reddit ↗", exact: true }).waitFor();
  assert.ok(Math.abs(await page.locator(".deck-scroll").evaluate((element) => element.scrollLeft) - deckLeft) <= 1, "focus exit restores deck position");
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Command palette", exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Command", exact: true }).fill("text size");
  await page.keyboard.press("Tab");
  assert.ok(await page.evaluate(() => !!document.activeElement.closest("dialog")));
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await mainNav(page, "X");
  const xPanel = page.getByRole("main", { name: "X reading", exact: true });
  await xPanel.waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0, "X opens as a main destination");
  assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "X", exact: true }).getAttribute("aria-current"), "page");
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
      await xPanel.evaluate((element) => { element.scrollTop = 0; });
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
  await page.getByRole("main", { name: "X reading", exact: true }).getByRole("button", { name: "Load embed", exact: true }).waitFor();
  assert.equal(await page.getByRole("main", { name: "X reading", exact: true }).getByRole("link", { name: "Open on X ↗", exact: true }).getAttribute("href"), "https://x.com/i/lists/123456789", "saved X sources survive reload");
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
  console.log("PASS: Brief/Broad defaults, opt-in Bluesky, preference migrations, coverage, window/category requests, explicit read/save, library search/notes/reload, 320–1440px layouts, one-click Settings gear/drawer, touch targets, settings controls/focus, deck focus, main X consent/retry/fallback/reload, held refresh.");
  console.log("Screenshots: " + join(tmpdir(), "gcdsignal-mobile-qa.png") + " and " + join(tmpdir(), "gcdsignal-desktop-qa.png"));
  console.log("Settings and X screenshots: " + ["settings-mobile", "settings-desktop", "x-mobile", "x-desktop"].map((name) => join(tmpdir(), `gcdsignal-${name}-qa.png`)).join(", "));
} finally { await browser.close(); }
