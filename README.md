# gcd signal

A glass-dark, TweetDeck-style dashboard for trending AI content. One column per
source — Reddit (top of day with real vote counts), curated AI news from ~14
outlets, YouTube, X, Bluesky, GitHub trending repos, Hacker News, research
papers (Hugging Face + arXiv), and 4chan /g/ — with a category switcher,
custom feeds, per-column and configurable auto-refresh, dark/light themes, and
an optional daily email digest.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. All feed columns work out of the box with no API
keys (see notes below). Preferences (hidden columns, custom feeds, category,
theme) live in the browser's localStorage — no accounts, no database.

## Features

- **Categories** — Trending, Development, Security, Vibe Coding, Research,
  Industry. Switching re-queries every column with tuned per-source searches.
  Edit the mappings in [lib/categories.ts](lib/categories.ts).
- **Filter feeds** — hide/show any column from the ⚙ settings drawer.
- **Custom feeds** — add a subreddit, RSS URL, Hacker News/Bluesky search,
  Mastodon hashtag, or 4chan board. Each becomes its own column (pinned across
  categories). Feeds are test-fetched before they're added.
- **Dark mode default** with a persisted light-mode toggle (no flash).
- **Mobile** — columns become a swipeable snap carousel with a source chip bar.
- **Auto-refresh** on your schedule (off / 1m / 5m / 15m / 30m, paused while
  the tab is hidden) plus a manual refresh — both in the header popover.
- **Daily digest email** — top ~10 items across all sources, sent by a Vercel
  cron job through Resend (setup below).

## Source notes

All upstream fetching happens in the server route `/api/feeds/[source]` with
~5-minute caching, so browser CORS and upstream rate limits are non-issues.

- **Reddit** — Reddit no longer offers free API access, and anonymous JSON is
  blocked. Scores + comment counts come from parsing the legacy multireddit
  HTML (`www.reddit.com/r/a+b+c/top/`), which still carries exact `data-score`
  attributes; if Reddit ever blocks that, the column silently falls back to
  the public Atom feed (titles, no scores). Posts are interleaved per
  subreddit so one sub can't flood the column.
- **X** — unofficial embed/syndication endpoints (no free API exists): account
  timelines from ~8 major AI accounts, hydrated per-tweet for like/reply
  counts. Rate-limited upstream; the column caches the last good batch and
  shows an unavailable state if discovery fails cold. Least durable source by
  design.
- **YouTube** — with a free `YOUTUBE_API_KEY`: per-category video search with
  view/comment counts. Without: curated AI channels via keyless RSS (also has
  real view counts).
- **GitHub** — recently-pushed AI repos ranked by stars (unauthenticated
  search API).
- **Papers** — Hugging Face daily papers (community upvotes + comments) merged
  with recent arXiv cs.AI/LG/CL; arXiv is best-effort (aggressive rate
  limits).
- **Bluesky** — public AppView with host fallback (`public.api.bsky.app` →
  `api.bsky.app`); optional app-password auth as a last resort.
- **4chan** — read-only catalog API, text only, AI-keyword filtered, ranked by
  replies decayed by thread age so perennial generals don't pin the top.
- **AI News (RSS)** — ~14 outlets in [lib/sources/rss.ts](lib/sources/rss.ts),
  round-robin interleaved by outlet with a 7-day recency floor so no single
  publisher dominates and every outlet gets seen.

## Newsletter setup (Resend)

Subscribers are stored as contacts in a Resend **Audience** (free tier: 1
audience, 1,000 contacts, 100 emails/day) — no database needed. The daily
digest is sent as a Resend **Broadcast**.

1. Create a free account at https://resend.com.
2. Copy an API key (https://resend.com/api-keys) → `RESEND_API_KEY`.
3. Copy the default audience's ID (https://resend.com/audiences) →
   `RESEND_AUDIENCE_ID`.
4. Set `CRON_SECRET` to any long random string.
5. Put all three in `.env.local` (copy `.env.example`).

**Test mode:** without a verified domain in Resend, mail is sent from
`onboarding@resend.dev` and only delivers to *your own* (account owner) email.
To send to real subscribers, verify a domain at https://resend.com/domains and
set `DIGEST_FROM="gcd signal <digest@yourdomain.com>"`.

Trigger a digest manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/digest
```

## Deploy (Vercel)

```bash
npm i -g vercel && vercel
```

1. Add the env vars from `.env.example` in the Vercel project settings.
2. `vercel.json` already schedules the digest cron daily at 14:00 UTC.
   Vercel automatically attaches `CRON_SECRET` as the bearer token.
   (Hobby-tier crons run once per day and may drift within the hour.)
3. After deploying, open `/api/feeds/reddit` and `/api/feeds/bluesky` once to
   confirm both work from Vercel's IPs; add the Reddit OAuth env vars if the
   Reddit column reports errors.

## Project map

```
app/api/feeds/[source]/  feed proxy (validation, category resolution, caching)
app/api/subscribe/       newsletter signup → Resend contact
app/api/digest/          cron-triggered daily broadcast
lib/sources/             one adapter per source → normalized FeedItem[]
lib/categories.ts        category → per-source query config
components/              deck UI, settings drawer, dialogs
```
