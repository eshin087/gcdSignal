import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-ts.mjs";
const { VIEW_PATHS, categoryFromParams, isPlainClick, viewFromPathname, viewHref } = load("../lib/routes.ts");

test("each view is its own path and anything unknown is the Brief", () => {
  assert.deepEqual(VIEW_PATHS, { brief: "/", deck: "/deck", library: "/library" });
  assert.equal(viewFromPathname("/"), "brief");
  assert.equal(viewFromPathname("/deck"), "deck");
  assert.equal(viewFromPathname("/deck/"), "deck");
  assert.equal(viewFromPathname("/library"), "library");
  assert.equal(viewFromPathname("/elsewhere"), "brief");
});

test("every in-app link carries the category so history entries describe what they showed", () => {
  assert.equal(viewHref("brief", "trending"), "/?cat=trending");
  assert.equal(viewHref("deck", "research"), "/deck?cat=research");
  assert.equal(viewHref("library", "security"), "/library?cat=security");
});

test("only a known ?cat selects a category; anything else means the stored one", () => {
  assert.equal(categoryFromParams(new URLSearchParams("cat=research")), "research");
  assert.equal(categoryFromParams(new URLSearchParams("")), null);
  assert.equal(categoryFromParams(new URLSearchParams("cat=")), null);
  assert.equal(categoryFromParams(new URLSearchParams("cat=nope")), null);
  assert.equal(categoryFromParams(new URLSearchParams("cat=__proto__")), null);
});

test("modified clicks are left to the browser", () => {
  const click = (overrides) => ({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...overrides });
  assert.equal(isPlainClick(click()), true);
  assert.equal(isPlainClick(click({ button: 1 })), false);
  assert.equal(isPlainClick(click({ ctrlKey: true })), false);
  assert.equal(isPlainClick(click({ metaKey: true })), false);
  assert.equal(isPlainClick(click({ shiftKey: true })), false);
});
