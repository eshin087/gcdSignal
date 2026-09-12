# Product and operating decisions

These are accepted choices from project work, recorded 2026-09-11. They describe
intent; [STATUS.md](STATUS.md) records which implementation has shipped.
A later explicit user decision can supersede an entry.

| ID | Decision | Reason and boundary |
| --- | --- | --- |
| D01 | Target zero spending; keep GitHub Actions disabled. | GitHub is the source repository. Do not add paid APIs, services or scheduled compute without an explicit change of direction. A free-tier configuration is not a perpetual billing guarantee. |
| D02 | Broad + All AI + Brief is the default. | Important releases, research, business, policy and safety matter. Builder stays an explicit filter; no hidden Builder ranking bonus. |
| D03 | Show a finite essential Brief, with an explicit longer window. | Prefer fewer relevant events over filling space. Followed interests remain a separate section. |
| D04 | Show provenance and uncertainty honestly. | Reporting publishers differ from social circulation. Popularity is not verified importance, growth or fact-checking. Failures and stale content remain visible. |
| D05 | Read state comes from deliberate actions. | Scrolling is not reading. Shared article identity should preserve read/save/follow state across reposts. |
| D06 | Keep the research library browser-local. | No account or hosted synchronization service in this version. Offer backup and visible storage-failure handling. |
| D07 | X uses free official embeds and outbound links. | Main navigation may expose it, but embedded posts are outside native ranking/search. No paid X API, unofficial scraper or real-time freshness promise. |
| D08 | Bluesky is optional, not default coverage. | Recurring upstream failures prompted hiding its built-in Deck column and excluding it from Brief. Explicit later opt-in/custom feeds remain supported. |
| D09 | Settings is a visible gear with a vertical side panel. | Keep main navigation horizontal. Preserve theme/display choices and make controls usable on phones and with a keyboard. |
| D10 | Keep public docs sanitized and local operator details private. | Public notes support contributors without exposing credentials, personal data or account-specific configuration. |
| D11 | No public newsletter, paid summarization, web-wide crawler or browser extension in this release. | The reader uses attributed excerpts and transparent selection. Removal of newsletter code did not authorize deleting external subscriber records. |

## Changing a decision

Record the changed choice, its reason and relevant public PR/issue evidence.
Check storage migrations, user-visible copy and tests affected by that change.
Do not promote a roadmap idea or an unanswered question into an accepted choice.
