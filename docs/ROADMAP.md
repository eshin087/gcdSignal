# Roadmap and open questions

Recorded 2026-09-11. This is a decision queue, not a promise or permission to
implement every item. Delivery state belongs in [STATUS.md](STATUS.md).

## Accepted work awaiting delivery verification

The visible Settings gear/vertical drawer, main free X tab and Bluesky opt-in
changes are implemented in [PR #12](https://github.com/eshin087/gcdSignal/pull/12).
Recheck its current state before scheduling follow-up work.

## Open choices

- Which public X profiles or list, if any, should form a starter collection?
  Keep the current empty setup until a selection is made.
- Which browsing improvement should come next: catch-up, source-health controls,
  or faster research? No priority has been selected.

## Proposed additions

| Proposal | Useful outcome | Acceptance questions before implementation |
| --- | --- | --- |
| Five-minute catch-up queue | Turn unread essentials into a short sequence with progress and a clear finish. | Which items enter it? What explicit action advances/marks read? How should it differ from the existing Since your last visit filter? |
| Story update timeline | Show coverage added since the last read, with dates and original links. | How are new links distinguished from new developments without inventing a significance claim? Which history is stored locally? |
| Split-view research | Keep source excerpts and notes next to the feed without losing position. | How does it behave on phones? How does it reuse existing notes/collections and source inspection rather than duplicate them? |
| Hot topics strip | Group coverage by company, model or product across sources to show what is drawing attention now. | How is a topic named and bounded without merging distinct events? Which sources count toward it? |
| Rank by rate | Order counted sources by points per hour since posting, which needs no stored history. | This departs from the current "no velocity claims" wording: how is the measure labeled so it is not read as verified growth? |
| New models strip | Use Hugging Face's free trending-models list as a release radar. | Which uploads count as releases, given that anyone can upload a model? |
| Quiet-day section | Add a labeled "Earlier this week" section when the 24-hour window is thin. | D03 rules out silent backfill: what label and threshold keep it explicit? |

Improved source-health controls are an alternative priority, not an approved
fourth feature. Current coverage already exposes partial/stale failures; define
the missing user action before adding another status panel.

## Known limitations to revisit when relevant

- Free X embeds cannot supply guaranteed real-time, complete native discovery.
- The Brief sees its configured candidate pools, not every important AI story.
- Reused release-index URLs without a recognized model version can share a
  stable identity. Documented behavior is not a claim that every event is distinct.
- Local libraries and X links do not synchronize across devices.
- The AI word list is fixed text and ages as new model and company names appear.
- Reddit's scored listing has failed from production hosting since at least
  2026-11-08; the public feed in use there carries no vote or comment counts.
  The cause is not diagnosed.
- The GitHub column ranks recently pushed repositories by all-time stars, so it
  shows established projects, not new ones. Repositories created in the last
  month, with stars divided by age, would show what is rising.
- YouTube search results lean toward clickbait, while the curated channel list
  is used only when the API key fails.
- Google DeepMind's blog feed answers most uncompressed requests with gzip,
  which the bounded feed transport rejects by design, so it is not in the news
  roster. Bounded decompression in that transport would let it join.
- Share parameters on some publisher links are kept, so one article can appear
  under two URLs and miss a merge.

The no-cost, browser-local scope remains in [DECISIONS.md](DECISIONS.md).
Do not add paid services or revive removed features to work around these limits
without an explicit change of direction.
