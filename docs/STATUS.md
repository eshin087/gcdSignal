# Current project status

> **Merged to master on 2026-10-26 from a 2026-09-11 snapshot.** Since this note
> was written, PRs 12 and 14 to 20 merged: the Settings drawer and X tab (12),
> automatic X discovery (14), X as a home and Deck column (15, 16), streamlined
> focus and story details (17), the short README (18), one teal accent with a
> compressed Brief hero and visible Save and Must read icons (19), and URL routes
> for Brief, Deck, Library and the category (20). The sections below describe the
> September state and are kept as a dated handoff.

## Brief card readability, 2026-11-09 (local branch)

Committed on branch feat/brief-card-signal. It was not pushed, merged or
deployed when this note was written, so check Git and the live deployment
before treating it as delivered. The change:

- puts the evidence that was behind Details on the card: link origin, excerpt
  credit, publisher count, top Hacker News or Reddit votes and comments;
- shows a publisher's summary when the headline member has no text;
- shortens the excerpt line to about 75 characters, clamps it until Details
  open, and folds Details into the evidence line;
- shows relative times, and removes captions, newsletter prompts and related
  headlines from RSS excerpts.

Checked the same day: 135 unit tests, lint, the production build, and the
browser-smoke and reading-queue fixture suites passed. On a local run with live
sources at 1440 by 900, ten stories took 2,203px of scroll, down from 2,995px,
and the Guardian excerpts no longer carried the newsletter prompt. That run
reported 6 of 25 contributors on its first request, the known stale local
cache, so it is not a coverage measurement. Not done from the same review:
merging near-duplicate events, separating corroborated from latest stories,
phone header height, Deck card chrome and the command palette label.

## Coverage fixes, 2026-11-08 (PR 22)

Delivered through [PR #22](https://github.com/eshin087/gcdSignal/pull/22) from
branch fix/coverage-gaps; this note reaches master only with that merge. A live
check of production on 2026-11-08 had found the 24-hour Brief showing three
stories from one outlet while Hacker News's top AI stories, Reddit link posts
and every featured paper were missing, with all contributors reported healthy.
The change:

- takes Hacker News candidates from popular stories and the front page instead
  of a title search for "AI";
- labels unmatched articles from recognized news publishers as News;
- reads article links and list order from Reddit's public feed, and says when
  vote counts are missing;
- dates featured papers by the day they were featured;
- replaces The Register's quiet AI feed with its main feed and adds Google
  Research, The Guardian AI, NVIDIA and Techmeme.

Checked before the merge, the same day: 128 unit tests, lint, the production
build and the fixture browser suite (browser-smoke) passed. On the branch's
Vercel preview the Brief returned ten stories with 25 of 25 contributors
available, led by a story with three reporting publishers, and Reddit was served
by its public feed with article links and its missing-counts note. Those
responses were cached, so they do not measure a cold start. Production delivery
of the merge commit is not recorded here: recheck the live deployment before
treating it as shipped. Not diagnosed: why Reddit's scored listing fails from
production hosting. Selection details are in
[feed-selection.md](feed-selection.md); what was left out is in
[ROADMAP.md](ROADMAP.md).

## September snapshot

Snapshot verified **2026-09-11, America/Los_Angeles**. Recheck GitHub before
treating this as current; this file is intentionally a dated handoff.

## Repository and delivery

- Repository: [gcdSignal](https://github.com/eshin087/gcdSignal), public.
- Default branch: master. Verified head: 972ef3fd1bbde52d6b1e8084fd3c2f913b1a92d9.
- [PR #11](https://github.com/eshin087/gcdSignal/pull/11) is merged: removed
  GitHub Actions workflow files and warm-up endpoint. Repository Actions
  permission was freshly verified disabled at this snapshot.
- [PR #12](https://github.com/eshin087/gcdSignal/pull/12) is **open**, based on
  master, head 6e844227b27db2c0d76e247c1923ea502eec8b66. It adds the visible
  Settings gear/vertical drawer, main free X tab, and Bluesky opt-in migration.
- PR #12's Vercel preview reported success. GitHub's latest successful production
  deployment record points to 972ef3f, which does not include the Settings/X
  commit. The current production alias and hosting plan were not independently
  checked; a deployment record is not proof against a later manual promotion.
- Documentation/skills follow-up is on codex/project-playbook, based on
  codex/reader-settings-x. Its documentation describes the PR #12 source tree.
  Inspect both PR states before claiming these changes have shipped.

## Last application verification

The PR #12 source commit passed 80 unit tests, lint, and production build in the
2026-09-11 implementation session. Browser checks passed for Settings/navigation
at 320-1440px, focus restoration, preferences, default Bluesky exclusion,
library persistence, X consent/fallback/rendering, and blocked storage.
Mobile dark-theme switching was also checked.

Those are historical results for the stated source commit, not a fresh test run
of every future change. X success cases used fixture widgets. The checks do not
prove live X availability or measured Core Web Vitals.

## Open choices and next steps

- No default X account/list collection has been selected; the X view starts empty.
- The next feature priority is undecided; see [ROADMAP.md](ROADMAP.md).
- Review the Settings/X preview and the documentation follow-up. Merge or
  production delivery still depends on the applicable user authorization.
- Keep the configured zero-spending target. No new paid integration was added;
  do not infer a current hosting bill or plan from this code snapshot.

When updating this file, replace obsolete state and retain only the latest
useful evidence. Use Git history for earlier snapshots.
