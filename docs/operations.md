# Operation and verification

Use [STATUS.md](STATUS.md) for dated delivery evidence and
[DECISIONS.md](DECISIONS.md) for product constraints. This document owns the
procedures; private operator identifiers live outside the repository.

## Local development and checks

Install with npm ci when dependencies are missing or the lockfile changed.
The package scripts are dev, build, start, lint and test; there is no separate
typecheck or test:browser script.

For application-code changes, the normal checks are:

~~~bash
npm test
npm run lint
npm run build
~~~

The production build includes TypeScript checking. For a docs-only change,
review accuracy, local links, public exposure and git diff --check instead of
rebuilding the app.

Select additional checks for the affected contract:

| Change area | Focused verification |
| --- | --- |
| Relevance, categories, ranking, identity/progress | Unit suites curation, dependable-ranking and story-progress |
| Source normalization and partial Brief failures | Unit suites source-quality, papers-contract and brief-resilience |
| Caches, fetch boundaries and headers | Unit suites security, server-cache, feed-cache and rss-cache |
| Preferences and X URL validation | Unit suite reader-preferences |
| Library/backup contracts | Unit suite library; node tests/library-browser.mjs for real IndexedDB |
| Reader layout, Settings, navigation and keyboard | node tests/browser-smoke.mjs |
| X widgets, consent, storage recovery and stale work | node tests/x-browser.mjs |

Unit suites are `tests/<name>.test.mjs`; run them with node --test and the
corresponding filenames when a focused check is sufficient. Record actual
commands/results rather than inferring a pass from the presence of a test.

For the UI and X browser suites, build and start the app in another terminal:

~~~bash
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3001
~~~

Then run the selected suite. APP_URL defaults to http://127.0.0.1:3001.
The pinned Playwright dependency uses installed Chrome by default;
BROWSER_CHANNEL selects another installed browser, and PLAYWRIGHT_PATH can
select an existing installation for the reader/library/X suites. Do not add
GitHub Actions to run these checks.

The library browser suite does not need a running application. UI and X suites
intercept external requests and run against local servers only. Stop the local
server started for the task after verification.

## Performance and live-source diagnostics

tests/performance-spot.mjs is optional and contacts real upstream sources through
a local production server. It reports cold-browser and warm-browser observations;
the server cache may already be warm. Its first-headline time is not LCP.

Use live requests only when useful for the task. Separate build success, fixture
regressions, live coverage observations and measured performance. Do not call
ordinary browser regressions Lighthouse or Core Web Vitals measurements.

## Cache and coverage

Brief loads its reporting phase before complete coverage. Failed publishers
remain in health details; fresh response timestamps and HTTP 200 do not imply
healthy sources. Server and last-good caches are bounded per-instance memory.
Manual refresh does not bypass upstream caching.

See [ARCHITECTURE.md](ARCHITECTURE.md) for ownership and
[feed-selection.md](feed-selection.md) for selection/cache semantics.

## Hosting, firewall and release evidence

GitHub Actions is intentionally disabled; workflow files and the warm endpoint
were removed. Vercel's Git integration can still build previews independently.
A successful Vercel check is not evidence that GitHub Actions was re-enabled.

Inspect the target project's current firewall rules and pending draft before
adjusting a rule. Match the intended API paths and preserve unrelated settings;
never publish someone else's pending firewall changes. Account-specific IDs
and plan snapshots do not belong in this public procedure.

The desired operating cost is zero. Verify current provider plan, enabled
products and upstream API policies for cost questions. Do not turn a historical
free-tier snapshot into a perpetual no-charge guarantee.

For delivery, verify the PR's current base/head, merge state, deployed commit and
target environment. Respect the scope already authorized by the user. A preview
URL is not the production deployment. Update STATUS after material changes.

## Security policy and private data

CSP remains report-only. Hashes track the two prepaint scripts; X widget origins
are scoped. Next-generated hydration scripts still need a deliberate policy
before enforcement. Review legitimate policy violations and exercise the normal
page plus X loading before changing enforcement; do not add broad wildcards to
silence reports.

Keep credentials in server-side environment configuration, not public notes or
client-prefixed variables. Review logs without recording secret values.

Library backups contain personal reading data and notes; export before clearing
site data. X bookmarks use Export saved links separately. See README for retention
and backup limits. Removal of newsletter code did not authorize deleting
external subscriber records.
