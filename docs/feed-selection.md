# How Signal selects and ranks feeds

Signal uses source queries and explainable text rules, not a language model.
No paid classifier, account, database, or new external service is required.

## Selection

1. Each source has category-specific searches, communities, channels, or outlets
   in `lib/categories.ts` and its source adapter.
2. The shared AI gate in `lib/relevance.ts` checks AI-related words and phrases.
   General sources normally need a title match; balanced sources can instead
   match two distinct terms in the excerpt. A sparse strict feed may become
   balanced, but never drops this gate entirely. AI-scoped paper/catalog sources
   have upstream filtering. Explicit custom feeds retain their chosen scope.
3. `lib/curation.ts` assigns rule-based content types and topics. Builder mode
   favors tools, releases, research, security, tutorials, technical discussions,
   and selected industry news. It also checks the selected topic independently.
   Broad mode includes the broader conversation within the fetched source pool.
   It is an explicit choice, not an automatic fallback to unrelated posts.
4. Explicit author/outlet mutes apply in either mode, including custom feeds.

These rules can miss unusual phrasing or mislabel a post. The story preview's
**Why shown?** section explains text matches; it does not verify factual claims.

## Ranking and trending

- **Hot** preserves the source adapter's ranking.
- **New** sorts by publication time.
- **Top / Discussed** use the available score or comment count.
- **Signal** combines freshness (35%), engagement percentile within a platform
  (25%), builder relevance (20%), and followed topics (20%). Ties share a rank;
  missing engagement is neutral. A diversity pass limits repeated outlets or
  authors when alternatives exist.

For You uses global Signal ranking; raw scores in other engagement sorts are
ranked per source and interleaved, since views and votes aren't interchangeable.
New items and previously seen items are kept in separate sections.

Trending is a recent, relevant, engaged-content heuristic. There is no stored
engagement history, so Signal does **not** measure growth rate or acceleration.
Following a topic boosts it in Signal sort; it does not change upstream queries.

## Story groups

For You and Daily Top 10 group canonical article URLs and similar recent
headlines. Tracking parameters are removed, but article IDs and YouTube video
IDs remain distinct. Version conflicts and representative-only comparisons
reduce false merges. Grouping is still heuristic.

Top 10 uses a 36-hour candidate window and ranks coverage breadth, normalized
engagement, and freshness. RSS publisher domains are counted separately from
platforms such as Reddit. Each publisher/platform contributes once. Expand a
story to inspect its posts and sources; coverage counts are not fact checking.
Builder mode and mutes can leave fewer than ten stories.

## Browser behavior and privacy

Preferences, followed topics, mutes, and reading history stay in this browser.
No personalization signals are sent to the server. Cached feed responses are
shared by Deck and For You: up to 24 entries, a 24-hour lifetime, and a bounded
localStorage payload. Responses younger than one minute can be reused directly;
older responses are labeled cached while a request runs.

Sources load independently. Offscreen deck columns mount as they approach the
viewport and remain mounted to preserve reading position. A background refresh
does not replace the reading list while scrolled down; apply the new-items
button when ready. Source failures are reported separately from cached data.

## Verification

`npm test` runs deterministic selection, ranking, grouping, and cache tests
without upstream requests. Also run `npm run lint` and `npm run build`.

The optional `node tests/browser-smoke.mjs` suite requires an existing
Playwright installation and Chrome (or `BROWSER_CHANNEL`). Set
`PLAYWRIGHT_PATH` to that installation if it is not locally resolvable, and
`APP_URL` to a running local Signal server. It uses isolated fixture feeds,
tests responsive widths from 360 to 1440 pixels, dialog focus, preferences,
status reporting, focus-mode position, and background-refresh stability.
These are functional checks, not Lighthouse or Core Web Vitals measurements.
