# Current project status

> **Merged to master on 2026-10-26 from a 2026-09-11 snapshot.** Since this note
> was written, PRs 12 and 14 to 20 merged: the Settings drawer and X tab (12),
> automatic X discovery (14), X as a home and Deck column (15, 16), streamlined
> focus and story details (17), the short README (18), one teal accent with a
> compressed Brief hero and visible Save and Must read icons (19), and URL routes
> for Brief, Deck, Library and the category (20). The sections below describe the
> September state and are kept as a dated handoff.

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
