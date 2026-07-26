# gcd signal

A glass-dark, TweetDeck-style dashboard for trending AI content. One column per
source — Reddit (top of day), curated AI news from ~15 outlets, Bluesky,
Mastodon (instance trending + tags), and 4chan /g/ — with a category switcher,
custom feeds (including Hacker News searches), configurable auto-refresh,
dark/light themes, and an optional daily email digest.

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

- **Reddit** — anonymous JSON is blocked from many networks/datacenter IPs.
  The adapter falls back to Reddit's public Atom feed automatically (posts
  still hot-ranked, but no vote counts). For full data, add free API
  credentials (`REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` in `.env.local`,
  see `.env.example`) — create a "script" app at
  https://www.reddit.com/prefs/apps.
- **Bluesky** — uses the public AppView (`public.api.bsky.app`). Bluesky
  IP-blocks some networks/regions; if the column shows a 403 locally it will
  generally still work once deployed.
- **4chan** — read-only catalog API, text only, filtered to AI-related threads
  by keywords. Content is unmoderated; keywords are in
  [lib/categories.ts](lib/categories.ts).
- **AI News (RSS)** — curated list in [lib/sources/rss.ts](lib/sources/rss.ts):
  TechCrunch, The Verge, VentureBeat, Ars Technica, MIT Tech Review, The
  Decoder, Simon Willison, Wired, The Register, ZDNet, IEEE Spectrum, Hugging
  Face, Google AI, 404 Media, TechRadar — capped per site so no outlet
  dominates.
- **Mastodon** — blends the instance's trending posts (keyword-filtered) with
  hashtag timelines, ranked by engagement.

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
