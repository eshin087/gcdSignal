<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# gcdSignal project context

For non-trivial project work, start with [docs/STATUS.md](docs/STATUS.md) and
[docs/DECISIONS.md](docs/DECISIONS.md). The [project guide](docs/README.md) routes
to architecture, feed selection, operating checks and proposed work; read only
what the task needs.

Verify changing facts against the checkout, GitHub and deployment evidence.
Distinguish local work, an open PR, a merged PR and a live production commit.
Current user instructions and fresh evidence override an older status note.

During implementation or a requested handoff, update the relevant docs when
behavior, decisions, checks or delivery state materially change. Keep STATUS
short and dated; keep unapproved ideas in ROADMAP. Ordinary read-only questions
do not require rewriting project notes.

Preserve the Broad/Brief defaults, explicit read actions and zero-spending
direction unless the user changes them. Run checks locally; do not reintroduce
GitHub Actions. Use docs/operations.md to choose checks appropriate to the task.
These notes do not authorize merging, deployment or unrelated changes.

Public docs must remain sanitized. Keep populated environments, private reading
data, account-specific infrastructure IDs and local machine details out of Git.
