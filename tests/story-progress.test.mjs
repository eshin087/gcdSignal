import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-ts.mjs";
const { followedBriefRecords, storyProgress, visibleBriefStory } = load("../lib/story-progress.ts");
const { stableStoryId } = load("../lib/stories.ts");
const a = { id: "a", source: "rss", title: "AI model release", url: "https://a.example/news/model" };
const b = { ...a, id: "b", url: "https://b.example/report/model" };
test("catch-up distinguishes newly found coverage from a newly encountered story", () => {
  const records = new Map([[stableStoryId(a), { firstSeenAt: 1000, readAt: 2000 }], [stableStoryId(b), { firstSeenAt: 6000 }]]);
  assert.deepEqual(storyProgress({ members: [a, b] }, records, 5000), { read: true, isNew: false, additional: true });
  assert.deepEqual(storyProgress({ members: [b] }, records, 5000), { read: false, isNew: true, additional: false });
  records.set(stableStoryId(b), { firstSeenAt: 6000, readAt: 7000 });
  assert.deepEqual(storyProgress({ members: [b] }, records, 5000), { read: true, isNew: false, additional: false });
});
test("first visits and unchanged polls are not mislabeled as new developments", () => {
  const records = new Map([[stableStoryId(a), { firstSeenAt: 1000 }]]);
  assert.deepEqual(storyProgress({ members: [a] }, records, null), { read: false, isNew: false, additional: false });
  assert.deepEqual(storyProgress({ members: [a] }, records, 5000), { read: false, isNew: false, additional: false });
  records.set(stableStoryId(a), { firstSeenAt: 1000, coverageAddedAt: 6000 });
  assert.equal(storyProgress({ members: [a] }, records, 5000).additional, true);
});

test("unread items collected during a prior visit do not become new on a later visit", () => {
  // Previous visit started at1000; this unread item arrived later in that visit.
  const records = new Map([[stableStoryId(a), { firstSeenAt: 3000 }]]);
  assert.deepEqual(storyProgress({ members: [a] }, records, 5000), { read: false, isNew: false, additional: false });
  records.set(stableStoryId(b), { firstSeenAt: 5000 });
  assert.deepEqual(storyProgress({ members: [a, b] }, records, 5000), { read: false, isNew: false, additional: true });
  assert.deepEqual(storyProgress({ members: [b] }, records, 5000), { read: false, isNew: true, additional: false });
});

const now = Date.parse("2026-09-07T20:00:00Z");
const item = (id, title, extra = {}) => ({
  id, title, source: "rss", url: "https://news.example/" + id,
  timestamp: new Date(now - 3600000).toISOString(), ...extra,
});
const broad = { contentMode: "broad", mutedAuthors: [], mutedOutlets: [], followedTopics: [] };
const story = (members) => ({ id: "story", title: members[0].title, url: members[0].url, sources: ["rss"], timestamp: members[0].timestamp, members });

test("muting the substantive report cannot promote its primary tutorial into Brief", () => {
  const report = item("report", "OpenAI releases GPT-6");
  const tutorial = item("guide", "How to get started with GPT-6", { url: "https://openai.com/index/gpt-guide" });
  const result = visibleBriefStory(story([report, tutorial]), { ...broad, mutedOutlets: ["news.example"] }, "trending", new Map(), 24);
  assert.equal(result, null);
});

test("Brief picks surviving qualified reporting and clears muted source links and counts", () => {
  const primary = item("primary", "Introducing GPT-6", { url: "https://openai.com/index/gpt-6", comments: 100 });
  const tutorial = item("guide", "How to build with GPT-6", { url: "https://anthropic.com/news/guide" });
  const report = item("report", "OpenAI releases GPT-6", { comments: 4 });
  const repost = item("repost", report.title, { source: "reddit", url: "https://reddit.com/r/ai/comments/one", externalUrl: report.url, comments: 7 });
  const input = { ...story([primary, tutorial, report, repost]), primaryUrl: primary.url, discussUrl: primary.url, publishers: ["openai.com"] };
  const result = visibleBriefStory(input, { ...broad, mutedOutlets: ["openai.com"] }, "trending", new Map(), 24);
  assert.equal(result.title, report.title);
  assert.equal(result.members[0].id, "report");
  assert.equal(result.url, report.url);
  assert.equal(result.primaryUrl, undefined);
  assert.equal(result.reasons.includes("Includes a primary source"), false);
  assert.deepEqual(result.publishers, ["anthropic.com", "news.example"]);
  assert.deepEqual(result.platforms, ["reddit"]);
  assert.equal(result.comments, 11);
  assert.equal(result.discussUrl, repost.url);
  assert.equal(result.members.some((member) => member.id === "primary"), false);
});

test("qualified primary announcements remain preferred and category/dismissal still apply", () => {
  const report = item("report", "OpenAI releases GPT-6");
  const primary = item("primary", "Introducing GPT-6", { url: "https://openai.com/index/gpt-6" });
  const input = story([report, primary]);
  const result = visibleBriefStory(input, broad, "trending", new Map(), 24);
  assert.equal(result.members[0].id, "primary");
  assert.equal(result.primaryUrl, primary.url);
  assert.equal(visibleBriefStory(input, broad, "research", new Map(), 24), null);
  assert.equal(visibleBriefStory(input, broad, "trending", new Map([[stableStoryId(report), { firstSeenAt: 1000, dismissedAt: 2000 }]]), 24), null);
});

test("Following respects author/outlet mutes even for explicit follows or term matches", () => {
  const records = [
    { item: item("author", "Anthropic announces AI model", { author: "Muted writer" }), followedAt: 1000, lastSeenAt: now + 2 },
    { item: item("outlet", "Anthropic announces AI model", { url: "https://muted.example/news" }), lastSeenAt: now + 1 },
    { item: item("allowed", "Anthropic announces AI model"), lastSeenAt: now },
    { item: item("old", "Anthropic announces AI model", { timestamp: new Date(now - 73 * 3600000).toISOString() }), followedAt: 1000, lastSeenAt: now },
    { item: item("dismissed", "Anthropic announces AI model"), dismissedAt: 1000, followedAt: 1000, lastSeenAt: now },
  ];
  const prefs = { ...broad, mutedAuthors: ["rss:muted writer"], mutedOutlets: ["muted.example"] };
  assert.deepEqual(followedBriefRecords(records, prefs, ["Anthropic"], now).map((record) => record.item.id), ["allowed"]);
  assert.deepEqual(followedBriefRecords([records[2]], prefs, [" "], now), []);
});
