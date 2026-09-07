# gcd signal

A local-first AI news reader: a concise **Brief** for important developments,
an optional source **Deck** for deeper browsing, and a searchable **Library**
for material you want to keep.

The default is **Brief + All AI**, not Builder. Selection uses transparent
rules and source evidence, not a paid language-model classifier. It is a
best-effort reading aid, not a guarantee that every important story is covered.

## Run locally

~~~bash
npm ci
npm run dev
~~~

Open [localhost:3000](http://localhost:3000). No Signal account, paid AI service,
or hosted application database is required. Some upstream sources may require
optional credentials or be unavailable from your host; the coverage display
reports failures instead of promising that every feed always works.

## Reading workflow

- **Brief:** up to ten substantive stories from the last 24 hours, with an
  explicit 72-hour expansion, original links, excerpts, selection reasons and
  reporting/discussion counts. “Since your last visit” means new to your local
  collection, not every new post on the internet.
- **Deck:** configurable source columns, focus mode, mobile navigation,
  sorting, optional Builder filtering and custom feeds. Topic selection remains
  meaningful in All AI; a thin topic is not silently filled with unrelated posts.
- **Library:** search fetched stories and saves by text, source, topic, content
  type, publication date, collection and read/saved/followed state. Keep notes,
  collections, saved searches and followed company/topic terms. This searches
  collected feed text and notes—not the whole web or full articles.
- **Read deliberately:** save, mark read/unread, dismiss and follow a story.
  The Following section uses collected items and does not replace essential
  news with a personalized bubble.
- **See coverage:** the Brief first loads news/RSS and Hacker News, then enriches
  the list with other configured sources. Retrieval time, stale results and
  partial publisher/source failures are shown separately. Updates wait behind
  an “Update brief” control when you are reading farther down the page.

[How selection, ranking and storage work](docs/feed-selection.md) describes the
heuristics and limitations. Existing pre-v7 preferences migrate to Broad/Brief;
other preferences and custom feeds are retained. Builder remains an explicit
opt-in after migration.

## Sources and optional configuration

Server adapters normalize source data into feed items. Availability, metrics
and coverage vary; no source supplies an exhaustive view of AI news.

- **AI News:** curated editorial RSS plus verified primary feeds including
  OpenAI, Google AI and Hugging Face. Anthropic and Microsoft AI newsroom links
  are provided as direct links, not claimed as live feed integrations.
- **Reddit:** optional OAuth credentials; HTML and Atom paths provide
  best-effort fallbacks. Missing engagement is not fabricated.
- **YouTube:** an optional YOUTUBE_API_KEY enables API search; curated channel
  RSS is the fallback. Quotas and channel availability still apply.
- **Hacker News / Bluesky:** category queries over available posts. Bluesky
  uses configured app-password authentication first when provided, with public
  hosts as best-effort alternatives.
- **Papers / GitHub / 4chan:** optional Deck columns. GitHub shows recently
  active repositories ranked by existing stars, not measured star growth.
  Papers combine Hugging Face and arXiv; 4chan is text-only and hidden by default.

Custom feeds support subreddit groups, RSS URLs, YouTube channels, GitHub/Hacker
News/Bluesky searches and 4chan boards. Their explicitly chosen scope is kept
across topic changes; author/outlet mutes still apply.

Use [.env.example](.env.example) for optional server credentials. Never place
secrets in client-prefixed variables or commit your local environment file.
Email signup, broadcast delivery and Resend configuration have been removed.

### X: optional reading panel, not an algorithmic feed

Save a public X profile, list or individual-post URL, then choose **Load embed**
if you want X to render it. No X widget request is made before that action.
Loading an embed contacts X and may depend on sign-in, browser restrictions or
X availability; **Open on X** remains available if embedding fails.

Signal does not discover, rank, archive or search the embedded posts. No paid
X API or unofficial timeline scraping is used. The panel keeps up to 50 link
bookmarks locally and has its own link export, separate from Library backups.

## Local data and backups

The Library uses IndexedDB in this browser. Ordinary collected items expire
after 30 days without being fetched again and are capped at 5,000 records.
Saved, followed, noted or collection-assigned items are excluded from automatic pruning.
This is application behavior, not protection against clearing browser data,
private-mode cleanup or storage eviction.

Use **Export backup** in Library regularly. Versioned JSON backups include
stories, reading/saved/follow states, notes, collections, saved searches and
followed terms; imports validate and merge them. Import limits are 25 MB and
20,000 records. Backups are not encrypted and are not a backup of all app
preferences or the separate X bookmarks.

Legacy localStorage saves migrate to IndexedDB. If storage fails, the app
shows a warning and retains accessible changes in memory; export before closing
the tab. There is no automatic cross-device account sync.

## Caching and deployment

Feed responses are shared across views with a five-minute fresh window,
up to 24 browser-cache entries and a 24-hour stale fallback lifetime.
Server requests also use bounded five-minute caching and request deduplication.
Manual refresh rechecks the shared feed endpoint; it does not bypass server
limits with an unrestricted force-fresh request.

Connect the repository to Vercel and use the normal Next.js build, or run
npm run build and npm start on a compatible Node host. Configure optional source
credentials for that deployment and verify the coverage display there: a source
working locally may be blocked from a hosting network.

The optional GitHub Actions keep-warm workflow calls the authenticated /api/warm
endpoint. It requires matching CRON_SECRET values in the deployment and GitHub
repository secrets; it is unrelated to email. Warm-instance fallback caches
are not durable storage, and warming does not guarantee upstream health.

## Verification

~~~bash
npm test
npm run lint
npm run build
~~~

The deterministic suite covers selection, unbiased ranking, clustering,
version-aware identity, cache behavior, local-library validation and security
helpers without depending on live news.

Browser suites use the pinned Playwright dev dependency and Chrome by default
(or BROWSER_CHANNEL). Set PLAYWRIGHT_PATH only to use a different installation.

~~~bash
node tests/library-browser.mjs
node tests/browser-smoke.mjs
~~~

The library suite uses an isolated page and real IndexedDB; it does not need a
running server. The UI suite uses local fixture feeds; run the app first and set
APP_URL if it is not at http://127.0.0.1:3001. These are functional regressions,
not Lighthouse or Core Web Vitals measurements.
