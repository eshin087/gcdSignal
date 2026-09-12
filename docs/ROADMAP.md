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

Improved source-health controls are an alternative priority, not an approved
fourth feature. Current coverage already exposes partial/stale failures; define
the missing user action before adding another status panel.

## Known limitations to revisit when relevant

- Free X embeds cannot supply guaranteed real-time, complete native discovery.
- The Brief sees its configured candidate pools, not every important AI story.
- Reused release-index URLs without a recognized model version can share a
  stable identity. Documented behavior is not a claim that every event is distinct.
- Local libraries and X links do not synchronize across devices.

The no-cost, browser-local scope remains in [DECISIONS.md](DECISIONS.md).
Do not add paid services or revive removed features to work around these limits
without an explicit change of direction.
