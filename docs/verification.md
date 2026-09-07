# Dependable reader verification

Verified locally on 2026-09-07 using the production Next.js 16.3.4 build, Node 22.15.0 and headless Chrome on Windows. This branch starts from PR #7's QA commit 734798f; neither PR #7 nor the separate revert PR was merged or changed.

## Automated checks

- 77 unit tests pass, including live-style news fixtures, Broad/category independence, sponsor ambiguity, version-aware grouping, discussion versus reporting attribution, primary research without votes, stale health, migration/import safety, bounded caches, RSS DNS/redirect/byte/time limits and malformed provider isolation.
- ESLint and the production build pass.
- npm audit reports zero vulnerabilities, including dev dependencies, at verification time.
- Real IndexedDB browser regressions pass: migration, reload durability, explicit read, saved notes/collections/follows, import validation, two-tab field merging and protected-record pruning.
- Reader browser regressions pass with isolated feed fixtures: Brief/Broad defaults, v6/v7 preferences, 24/72-hour selection, categories, source health, search, note editing, cross-tab draft preservation, saved state, native-dialog focus, keyboard/deck navigation, blocked-X fallback and held refresh.
- Responsive checks pass at 360, 390, 430, 768 and 1440px; exactly one Brief Refresh control is visible, and no document-level horizontal overflow is introduced.

The new Verify reader workflow runs tests, lint, dependency auditing, production build and Chromium browser regressions, and uploads fixture screenshots as evidence.

## Live-source and API checks

- The complete Brief returned ten stories without losing reporting when secondary providers joined.
- Real Hugging Face organization objects and Google RSS author objects exposed provider-contract failures during QA. Both are normalized, with regressions; an additional malformed-provider test confirms healthy contributors remain usable.
- Google's canonical RSS endpoint returned three items with string authors. OpenAI's official RSS was also retrieved successfully during verification.
- ZDNet and Bluesky were unavailable in the observed run. Their failures remained visible; cached RSS results retained their original success times and stale status. This does not establish availability from every Vercel region.
- Running production API returned 400 for an invalid category, unsupported window and private-IP custom RSS URL. A legacy fresh=1 request returned 308 to the canonical cached URL.
- Response headers include nosniff, DENY framing, referrer/permissions policies and CSP report-only. CSP is not enforced: Next-generated inline hydration/RSC scripts still need a deliberate policy before enforcement.
- The free Vercel API rate-limit rule is live; details and its exact ID are in operations.md. No paid service was enabled.

## Separate mobile browser spot checks

One observed run of node tests/performance-spot.mjs against the local production server: 390x844 viewport, 150ms browser network latency, 1.6Mbps browser download, 4x CPU slowdown. The existing framework RSS cache was present, including stale entries being revalidated. This is a cold-browser comparison, not a guaranteed cold server; server-to-publisher traffic was not throttled by Chrome.

| Browser state | First visible headline | JS transferred | CSS transferred | Brief API requests |
| --- | ---: | ---: | ---: | ---: |
| Fresh isolated browser | 2.809s | 176,378 bytes | 12,798 bytes | 2 |
| Same-browser reload | 0.475s | 0 bytes | 0 bytes | 0 |

Both runs showed ten stories, no browser runtime errors, no horizontal overflow and no X widget requests before consent. The first headline started at 476px on the 390px viewport. Screenshots were visually reviewed at mobile and desktop sizes.

These are single-run functional/browser timing observations, not a before/after performance claim, Lighthouse scores or measured Core Web Vitals. The web-perf skill's tracing tools were unavailable, so no LCP, INP or CLS result is claimed.

## Deliberate limits

Selection remains transparent rule-based prioritization, not fact-checking or generated analysis. X is a click-to-load external reader, not native discovery or searchable timeline ingestion. Library backups are local, unencrypted and not cross-device sync. Subscriber/digest code was removed, but external subscriber data and accounts were not deleted.
