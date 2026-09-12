# Automatic X discovery

The accepted direction is a smaller selection from public sources that link to
X posts. AI on X is a default homepage column beside the Brief, not a separate
page or main-navigation tab. Discover shows automatically; saved profiles,
lists and posts stay under Saved sources inside the column.

Wide screens show both home columns together. Narrow screens keep full-width
columns with horizontal swiping and labeled jump controls. Deck also includes
AI on X after AI News by default, with hide, reorder and focus controls. The
Settings visibility toggle applies to both home and Deck. Preferences v9 map
the retired X-page setting to Brief and preserve saved links and other choices;
v10 makes 4chan opt-in independently of X.
X covers All AI with its own text/date filters, independent of the Brief/Deck
topic and Builder filters.

The column shares flat card rows, typography, metadata styling and density
preferences with other feeds. Its shared aligned header includes source status,
an available-post count, a bookmark control for Saved sources and refresh.
Filter opens the optional text/date/order controls; the All AI scope summary
expands coverage and selection details. Each row keeps sources and actions under
one Details control. Load post from X is an explicit widget request, while the
headline and Open on X remain direct outbound links.

## Sources and selection

- Two fixed [Hacker News search](https://hn.algolia.com/api) requests retrieve up
  to 100 recent stories each matching twitter.com or x.com in their outbound
  URL. Host/path validation rejects fuzzy URL matches, profiles and non-posts.
- [Latent Space RSS](https://www.latent.space/feed) supplies links mentioned in
  its public AI coverage. Only dated publisher articles and a paragraph with
  one distinct post ID qualify. Multi-post paragraphs are skipped because their
  context cannot safely be attributed to one post.
- Existing AI text rules apply to the HN headline or individual RSS paragraph.
  Unrelated links, sponsor copy, invalid dates and unsafe URLs are excluded.
  This is a relevance heuristic; it is not claim verification.
- The fetched candidate window is seven days, capped at 80 final posts. The
  default view shows links shared within three days; 24-hour and seven-day
  views are explicit options. Quiet periods can have few or no results.

## Ordering and meaning

Popular combines recency, logarithmically bounded HN points/comments, and a
small bonus when both sources cite the same post. It takes the maximum HN
score/comment counts across submissions rather than summing reposts. A
diversity pass allows at most two posts per author among the first 20 while
other authors remain available. Text/date filters preserve this returned order;
Newly shared sorts by the source sharing date instead.

Canonical post IDs merge x.com/twitter.com URLs, tracking parameters, media
suffixes and account-name changes. Different post IDs remain distinct. Source
descriptions are displayed as attributed context, not as the author's actual
tweet. Shared dates are the citing source's publication date; an old post can
be shared again. HN points and comments are labeled as such; HN comments can
appear in the collapsed row as a discussion indicator. Free discovery does not
supply X likes, views, replies or reposts, so unavailable values are not shown
as zero. There are no global popularity estimates or measured growth claims.

## Requests, failure and privacy

The fixed endpoint is `/api/feeds/x-discovery`; it rejects all query parameters.
Sources share five-minute caches and concurrent requests. The transport caps
responses at 2 MB, each request at six seconds, and external concurrency at
four, with public DNS/redirect validation. Failures stay in contributor health;
other sources continue to work. Last-good server data is bounded warm-instance
memory for up to 24 hours, not a durable outage guarantee.

The browser keeps a session cache. Refresh follows the existing reader setting
and pauses in background tabs; manual checks also respect caching. Changed
cards wait behind Show updated discoveries. Source refresh schedules can lag
the original posts by hours or longer, irrespective of polling frequency.

Displaying the default column does not contact X. It loads no external thumbnails. Load
post from X explicitly starts an official widget in a dialog; Open on X remains
available when embedding fails. Save post uses the existing local 50-link
store, with visible storage failures and export through Saved sources. Search
here filters discovery descriptions; these are not indexed in Library.

Add to Must read sends the displayed title, outbound URL, source label and an
internal story identity to the separate browser-local queue. Queue exports also
include the precise time each item was added. That unencrypted JSON can reveal
reading interests and timing, so store and share it accordingly. If existing
storage becomes unreadable, a recovery export is clearly labeled and contains
only the items still visible in that tab. Finishing a queue item does not remove
its X bookmark. Queue and X-link backups remain separate.

There are no new credentials, paid APIs, hosted databases, cron jobs or GitHub
Actions. The feature uses the existing site's hosting resources. No permanent
zero-cost or source-uptime guarantee follows from using free public endpoints.

## Implementation and checks

The data contracts and loader live in lib/x-discovery-types.ts and
lib/x-discovery.ts. The route is app/api/feeds/x-discovery/route.ts. The UI lives
in components/XDiscoveryFeed.tsx and components/XDiscoveryCard.tsx. The shared
feed-card-style module keeps native and X rows consistent; XReadingPanel
composes the shared ColumnHeader and owns saved links. lib/x-widgets.ts shares
the optional widget loader with saved sources.

Run npm test, npm run lint and npm run build. With a local production server,
run node tests/x-discovery-browser.mjs, node tests/x-browser.mjs,
node tests/browser-smoke.mjs and node tests/reading-queue-browser.mjs. Fixtures
exercise filtering, identity, attribution, partial/stale coverage, cache
behavior, layout, keyboard focus, explicit widget loading, blocked storage, and
empty/outage states. Live source spot checks are separate from fixture checks
and do not measure long-term uptime or Core Web Vitals.

## Verification snapshot

The minimal-feed refinement was verified on 2026-09-12
(America/Los_Angeles): 102 unit tests, lint, production build, the complete
reader/X browser matrix and the Must read/Library browser suites passed. Browser
fixtures cover 320–1440px layouts, four text sizes, 125–200% browser-zoom-equivalent
layout reflow, aligned headers, Focus restoration, collapsed Details, queue
backup/recovery, click-only X embeds and held updates. Desktop and phone
screenshots were reviewed.

A dated live mobile spot check used 150ms latency, 1.6Mbps download and 4x CPU
slowdown. It showed ten Brief stories, no X requests, no page-body overflow and
first-headline times of 2.741s for a cold browser and 0.375s on reload; the
server cache may already have been warm. Nineteen of twenty full-coverage
contributors succeeded, with one publisher temporarily unavailable. These are
not Core Web Vitals or continuous uptime measurements. GitHub Actions remained
disabled.

Verify the current PR and Vercel target before assuming a source tree is the
public production build.
