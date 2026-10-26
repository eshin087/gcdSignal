# Project guide

Start here when working on gcdSignal. These notes describe the product and its
maintenance; they are not a transcript or a source of deployment authority.

| Need | Read | Keep it current when |
| --- | --- | --- |
| Resume work or learn what shipped | [STATUS.md](STATUS.md) | A task ends, a PR merges, or delivery is verified |
| Understand settled product choices | [DECISIONS.md](DECISIONS.md) | A choice changes with the owner's direction |
| Locate code and data ownership | [ARCHITECTURE.md](ARCHITECTURE.md) | Modules, storage or request flows change |
| Understand selection and ranking | [feed-selection.md](feed-selection.md) | Selection or identity behavior changes |
| Choose checks or operate the deployment | [operations.md](operations.md) | Verification or hosting procedures change |
| Pick future work or answer an open question | [ROADMAP.md](ROADMAP.md) | Priorities or scope are agreed |

## How these notes stay useful

Current code and fresh repository/deployment evidence take precedence over an
old snapshot. Record the date and evidence for changing state. Keep current
status short; Git commits and PRs retain detailed history.

Update the relevant document in the same change as the behavior it describes.
Do not copy the same contract into every file. Proposals belong in ROADMAP,
not in the accepted decisions or release history.

Public notes may include public PR links, architecture, supported setting names,
and test commands. Keep credentials, account-specific infrastructure IDs,
personal exports and local machine details outside this repository.

## Optional local Codex skills

- gcd-signal-resume: reconcile notes, checkout, PRs and delivery state.
- gcd-signal-feed-quality: investigate selection, ranking and source reliability.
- gcd-signal-verify-release: choose checks and verify what was delivered.
- gcd-signal-maintenance: requested cleanup, public-documentation or cost review.

These skills are installed separately in the developer's local Codex skills
directory. They are not required to run Signal; this guide remains usable
without them.
