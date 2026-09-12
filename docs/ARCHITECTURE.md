# Architecture map

This map describes the source tree associated with the Settings/X work.
See [STATUS.md](STATUS.md) for merge/deployment state and
[feed-selection.md](feed-selection.md) for algorithm details.

## Request and reading flow

The page renders Dashboard. Browser preferences choose Brief, Deck, Library or
X; the main search opens Library. News adapters run on the server. Saved items,
notes and reading history remain in the browser.

| Area | Main files |
| --- | --- |
| App entry, metadata and theme prepaint | [page](../app/page.tsx), [layout](../app/layout.tsx), [prepaint](../lib/prepaint.ts), [styles](../app/globals.css) |
| Navigation, settings, refresh and keyboard | [Dashboard](../components/Dashboard.tsx), [Header](../components/Header.tsx), [SettingsDrawer](../components/SettingsDrawer.tsx), [use-dialog](../lib/use-dialog.ts), [use-hotkeys](../lib/use-hotkeys.ts) |
| Brief loading and rendering | [BriefView](../components/BriefView.tsx), [use-brief](../lib/use-brief.ts), [Brief API](../app/api/brief/route.ts), [brief selection](../lib/brief.ts) |
| Deck loading and rendering | [ColumnDeck](../components/ColumnDeck.tsx), [FeedColumn](../components/FeedColumn.tsx), [use-feed](../lib/use-feed.ts), [feed API](../app/api/feeds/[source]/route.ts) |
| Queries and source adapters | [categories](../lib/categories.ts), [feed-request](../lib/feed-request.ts), [source registry](../lib/sources/index.ts), [adapters](../lib/sources/) |
| Relevance, classification and ranking | [relevance](../lib/relevance.ts), [curation](../lib/curation.ts), [sort](../lib/sort.ts), [stories](../lib/stories.ts), [story-progress](../lib/story-progress.ts) |
| Research library and source inspection | [ResearchScreen](../components/ResearchScreen.tsx), [LibraryView](../components/LibraryView.tsx), [StoryDrawer](../components/StoryDrawer.tsx), [library](../lib/library.ts), [use-library](../lib/use-library.ts) |
| X sources and widgets | [XReadingPanel](../components/XReadingPanel.tsx), [x-links](../lib/x-links.ts) |
| Fetch boundaries and security headers | [safe-fetch](../lib/safe-fetch.ts), [rss-fetch](../lib/rss-fetch.ts), [fetch-helpers](../lib/fetch-helpers.ts), [Next config](../next.config.ts) |

The Brief source roster is separate from visible Deck columns: RSS/Hacker News
load first; the full phase adds Reddit, YouTube and Papers. Changing a Deck
toggle alone does not change the Brief roster. X is a view, not a SourceId.

## Browser state and migrations

| Store | Owner | Contract |
| --- | --- | --- |
| gcdsignal:prefs, schema v8 | [use-prefs](../lib/use-prefs.ts) | Source visibility/order, view, filters, display and refresh. Pre-v7 Broad/Brief migration and pre-v8 Bluesky migration run once; later explicit choices persist. |
| gcdsignal:theme | [ThemeToggle](../components/ThemeToggle.tsx), prepaint | Independent theme choice; otherwise follows system preference at initial load. |
| IndexedDB gcdsignal:library, schema v1 | [library](../lib/library.ts), use-library | Story-identity records plus metadata; ordinary items roll off after 30 days/5,000 records. Saved/followed/noted/collection items are exempt. |
| gcdsignal:saved | [library initialization](../lib/library.ts) | Legacy saves migrate; do not delete originals on failed migration. |
| gcdsignal:x-links:v1 | XReadingPanel | Up to 50 links and separate export. Failed saves are retained in this tab across view navigation, not browser reload. |
| gcdsignal:feed-cache:v2 | [feed-cache](../lib/feed-cache.ts) | Bounded browser response cache; shared by consumers and disposable. |

Library backups are separate from preferences and X-link exports. Changing
story identity affects reading, saving, following and merging, not only the
visible story title. Schema changes need explicit migration checks.

## Cache and health boundaries

API payloads use schemaVersion 2. Inspect health, error and stale as well as the
HTTP status. A 200 response can still represent an unavailable contributor.

Source requests use normalized keys and five-minute server caching. Shared loads
coalesce within an instance; [server-cache](../lib/server-cache.ts),
[bounded-server-cache](../lib/bounded-server-cache.ts) and
[last-good](../lib/last-good.ts) are bounded process-local stores. They are not
durable or distributed locks. Browser feed caches are separately bounded.

Auto-refresh pauses in background tabs. A scrolled Brief holds replacement data
behind an explicit update control. Public refresh does not bypass upstream
caches. X widgets load only after a click, use their own provider behavior, and
do not enter the news cache or research index.
