# How Signal selects, ranks and remembers stories

Signal uses source queries and explainable rules. It does not use a paid
classifier, generate article summaries, verify claims or measure the entire web.
The default experience is a broad AI **Brief**; Builder is an optional filter.

## Selection: relevance and topic are separate

1. Adapters request category-specific communities, searches, channels and RSS
   sources. A story absent from those candidate pools cannot be recovered by
   later ranking. The “All AI” category retains the internal identifier
   "trending" for API and stored-preference compatibility.
2. A source-aware AI gate checks the editorial headline/excerpt. General
   sources normally need a headline match; balanced sources may match two
   distinct excerpt keywords or a contextual model name. A sparse strict source
   can relax to balanced, but cannot disable the AI gate entirely.
3. Ambiguous names such as “Gemini” or “Llama” need AI/model context. Sponsor
   copy and URLs embedded in promotional text do not establish AI relevance.
   Known AI-native primary announcement sites can introduce unfamiliar names.
   These remain imperfect text rules, not semantic understanding.
4. Content labels and topics use editorial text plus the linked article path.
   Explicit research, security, industry and technical cues produce labels such
   as News, Release, Research or Tool. Broad/All AI does not remove the selected
   topic filter. Builder additionally retains technical types; it carries no
   hidden ranking bonus.
5. Explicit custom feeds retain their chosen scope instead of inheriting the
   built-in AI/topic gates. Author/outlet mutes apply even to custom feeds.

Labels are recalculated for selection rather than trusting obsolete cached
labels. A single editorial excerpt can supply a useful topic cue after AI
relevance has been established. Short or unusual phrasing can still be
misclassified; the interface exposes the reason and original source.

## Essential Brief

The Brief selects up to ten substantive story groups from a 24-hour window.
A 72-hour view is an explicit user choice, not a silent backfill. Grouping keeps
up to 72 hours of candidate context: a new repost does not reset the earliest
known publication time and revive yesterday's unchanged story in the 24-hour list.

Primary announcements and research papers can qualify without votes. Otherwise,
a story needs substantive reporting evidence; popularity alone cannot admit
an opinion or sponsored headline. The fixed source roster includes news/RSS,
Hacker News, Reddit, YouTube and Papers; the Brief is not simply the
visible Deck columns combined.
Bluesky is an optional Deck source and is not requested for the Brief.

Ranking favors primary sources, bounded reporting breadth and freshness.
Engagement is a small tie-breaker, not proof of importance. Primary papers have
a smaller source bonus than other primary announcements. While substantive
non-paper stories remain, at most two paper-only stories are selected; an outlet
diversity pass also reduces domination by one publisher. Quiet windows may
contain fewer than ten stories.

The main Brief is not reranked by followed topics or company terms. Following
adds a separate section using recently collected items. “Since your last visit”
uses local first-seen/read state: “new to you” does not necessarily mean first
published during this visit.

### Primary sources, reporting and discussion

- A **primary source** is an original announcement/research link recognized by
  source/domain rules. This is provenance, not a quality or truth guarantee.
- A **reporting publisher** is the article's domain (or a recognized official
  video channel). The same article linked by RSS, Reddit and Hacker News counts
  as one reporting origin.
- A **discussion platform** records circulation on services such as Reddit,
  Hacker News or YouTube. It is counted separately and does not add independent
  reporting weight.

Different publisher domains may still repeat one press release or claim.
Counts are never presented as verification. The source drawer lets you inspect
the actual coverage, and excerpts remain publisher-provided text.

## Deck ranking and story identity

Deck sorting remains available for deeper browsing:

- **Signal:** 45% freshness, 30% engagement percentile within each source and
  25% followed-topic match. Equal metric values share a rank; missing engagement
  is neutral. There is no Builder bonus.
- **New:** publication time.
- **Hot:** the adapter's existing ordering.
- **Top / Discussed:** available score/comment values; missing metrics follow
  measured items rather than becoming invented zeros.

Signal also limits repeated outlets/authors when alternatives exist. Scores
are relative to the fetched pool, not global platform popularity. YouTube
views and GitHub total stars do not measure growth; there is no historical
engagement series, so Signal does not claim trending velocity or acceleration.

Story grouping uses canonical article URLs and conservative recent-headline
overlap. Tracking parameters are removed while article/video identity
parameters remain. Integer/decimal model-version conflicts, different named
companies and incompatible event types reduce false merges; representative-only
comparison avoids transitive chains. Similar coverage can still split or merge
incorrectly.

The stableStoryId helper normally follows the canonical outbound article URL
across platform reposts. Clear evergreen changelog/release-notes/updates/release-index
URLs also include an explicit model-version discriminator, so a new version
does not inherit an old release's read state. Titles without a version are
conservative separate aliases. Ordinary article title changes keep URL identity.
Read actions on a group mark its known member identities; more linked coverage
is not automatically treated as a new independent development.

## Loading, freshness and coverage

Cold Brief loads request news/RSS and Hacker News first, followed by the full
source set. The API calls this first pass phase=primary; it means the initial
reporting pass, not “every item is a primary source.” A complete response may
still have failed contributors, which are reported separately.

Responses include retrieval time, aggregate source health and available
publisher/channel details. Health distinguishes successful, failed and stale
contributors; a fresh response envelope does not imply complete coverage or a
newly published article. A cached list can remain readable while an upstream
is unavailable.

Browser response caching is shared between views: up to 24 entries, a
five-minute fresh interval, 24-hour lifetime and bounded localStorage payload.
Server loaders use canonical keys, bounded five-minute caches and concurrent
request deduplication. Public manual refresh does not provide an unrestricted
upstream-cache bypass. CDN and source caches can also affect observed freshness.

Last-good server responses are warm-instance memory, not durable storage. The
browser cache can help a returning reader but cannot guarantee a cold visitor
gets a complete feed during an outage. Background changes wait behind an update
control while reading farther down; offscreen Deck columns load on approach.

## Library, privacy and backup

Fetched items can be collected into this browser's IndexedDB Library. Search
matches collected titles, excerpts, author/outlet metadata, topics, URLs,
personal notes and collections. It supports source/type/topic/date and
saved/unread/followed filters and saved searches. It is not internet search or
an index of full article bodies.

Ordinary archive records are kept for 30 days since last collection, capped at
5,000. Saved, followed, noted or collection-assigned items are never automatically
pruned by those limits. Clearing site data, browser eviction or device loss
can still erase them. Storage failure is displayed explicitly; in-memory
changes should be exported before closing the tab.

Versioned JSON export/import backs up Library stories and personal research
metadata. Imports validate link schemes, record structure and limits before
merging; existing notes and saves are preserved. Current limits are 25 MB and
20,000 records per import. Legacy localStorage saves migrate transactionally;
their original data is retained if migration cannot be safely completed.

Preferences and the Library stay local; there is no account-based cross-device
sync. Browsing still makes requests to the site's feed endpoints and may load
publisher thumbnails. Opening an original link contacts that website. Backups
contain personal notes in plain JSON, so store/share them accordingly.

## X discovery column

The default AI on X column sits beside the homepage Brief and appears in Deck.
It starts with Discover: dated links to X posts surfaced through Hacker
News and Latent Space's public RSS. AI relevance uses the citing headline or
individual paragraph; selection cannot inspect undiscovered X posts. Popular
ranking uses bounded HN points/comments, recency and inclusion by both public
sources. It does not measure X likes, reposts or trending velocity.

Post IDs deduplicate x.com/twitter.com links and account-name changes. Repeated
HN submissions do not add their scores together. Descriptions are attributed
source context, and sharing dates belong to that source, not necessarily the
original X post. Filters and coverage limits are detailed in
[X discovery](x-discovery.md).

Saved sources retains public profile/list/post bookmarks. Official widgets load
only after Load embed or Load from X; original links remain available when
widgets fail. Discovery and saved links remain separate from Brief story ranking
and Library storage. The column covers All AI with its own text/date controls;
the main topic and Builder filters do not change its selection. No paid X API
or unofficial timeline scraping is used. X bookmarks
have their own export and are not included in Library backups.

## Verification

Run npm test, npm run lint and npm run build. Pure fixtures cover AI/topic
gates, sponsor and ambiguous-name rejection, unbiased Signal ranking,
reporting-versus-platform counts, substantive Brief eligibility, 24/72-hour
windows, repost age, release identity, library import/retention and security
helpers.

Optional node tests/library-browser.mjs exercises real IndexedDB with an
isolated browser origin. node tests/browser-smoke.mjs runs fixture-based UI
checks against a local app. The x-browser and x-discovery-browser suites cover
saved widgets and automatic discovery. These need Playwright/Chrome; use PLAYWRIGHT_PATH
and BROWSER_CHANNEL for an existing installation, and APP_URL for a nondefault
local app address. Functional browser tests are not measured Lighthouse or
Core Web Vitals results.
