# Reading guide

How the reader is laid out, where its sources come from, and what it keeps in your browser. Moved here from the README so that it stays short. Selection and ranking rules are in [feed-selection.md](feed-selection.md); X discovery is in [x-discovery.md](x-discovery.md).

## Reading workflow

- **Addresses:** the Brief is `/`, the Deck `/deck` and the Library `/library`; `?cat=<category>` (for example `/deck?cat=research`) picks the topic row. Header and topic links update the address, so the back button, bookmarks and shared links all work. A bare address with no `?cat=` opens your stored topic, and `/` opens whichever view you used last.
- **Settings:** the gear in the header opens a vertical side panel for appearance, sources, refresh, interests and reading controls. Changes apply immediately.
- **Brief:** up to ten substantive stories from the last 24 hours, with an explicit 72-hour expansion, original links, excerpts, selection reasons and reporting/discussion counts. "Since your last visit" means new to your local collection, not every new post on the internet.
- **Deck:** configurable source columns, focus mode, mobile navigation, sorting, optional Builder filtering and custom feeds. Topic selection remains meaningful in All AI; a thin topic is not silently filled with unrelated posts.
- **Focus and details:** focus one Brief or Deck column without changing its reading position. Story rows keep secondary sources and actions behind one small **Details** control so headlines stay easy to scan.
- **Must read:** add any news, research or X link to one short browser-local queue from **Details**. **Done** removes it from the queue only; Library saves and X bookmarks remain unchanged. The queue has its own JSON backup.
- **Library:** search fetched stories and saves by text, source, topic, content type, publication date, collection and read/saved/followed state. Keep notes, collections, saved searches and followed company/topic terms. This searches collected feed text and notes, not the whole web or full articles.
- **Read deliberately:** save, mark read/unread, dismiss and follow a story. The Following section uses collected items and does not replace essential news with a personalized bubble.
- **See coverage:** the Brief first loads news/RSS and Hacker News, then enriches the list with other configured sources. Retrieval time, stale results and partial publisher/source failures are shown separately. Updates wait behind an "Update brief" control when you are reading farther down the page.

The default is **Brief + All AI**, not Builder. Selection uses transparent rules and source evidence, not a paid language-model classifier. It is a best-effort reading aid, not a guarantee that every important story is covered.

## Sources and optional configuration

Server adapters normalize source data into feed items. Availability, metrics and coverage vary; no source supplies an exhaustive view of AI news.

- **AI News:** curated editorial RSS plus verified primary feeds including OpenAI, Google AI and Hugging Face. Anthropic and Microsoft AI newsroom links are provided as direct links, not claimed as live feed integrations.
- **Reddit:** optional OAuth credentials; HTML and Atom paths provide best-effort fallbacks. Missing engagement is not fabricated.
- **YouTube:** an optional YOUTUBE_API_KEY enables API search; curated channel RSS is the fallback. Quotas and channel availability still apply.
- **Hacker News:** category queries over available posts.
- **Bluesky:** an optional Deck source, disabled by default and excluded from the Brief because of recurring connection errors. Explicit custom feeds and a later choice to enable its column remain available.
- **Papers / GitHub / 4chan:** optional Deck columns. GitHub shows recently active repositories ranked by existing stars, not measured star growth. Papers combine Hugging Face and arXiv; 4chan is text-only, opt-in and hidden by default.

Custom feeds support subreddit groups, RSS URLs, YouTube channels, GitHub/Hacker News/Bluesky searches and 4chan boards. Their explicitly chosen scope is kept across topic changes; author/outlet mutes still apply.

Use `.env.example` for optional server credentials. Never place secrets in client-prefixed variables or commit your local environment file.

### X: automatic discovery and saved sources

The homepage's **AI on X** column automatically finds AI-related X links shared on Hacker News and in Latent Space's public AI coverage. No handles or credentials are needed. It sits beside the Brief on wide screens; on phones, swipe across or use **AI on X** to reach the neighboring column. It is also a default Deck column, with the same hide, reorder and focus controls as other columns.

**Popular** uses source discussion activity, recency and cross-source selection; it does not measure X-wide virality. Hacker News comments remain labeled as HN discussion; free discovery does not supply X views, likes or replies. Filter by text or sharing date, inspect why a post appears, and save links for later. Descriptions and dates belong to the citing source; the original post may be older or unavailable.

Open **Details**, then choose **Load post from X** to view an original post in a dialog, or **Open on X**. The widget or original page may display X's current engagement counts, but Signal does not copy or rank by those counts. The header's bookmark icon opens **Saved sources**, retaining public profiles, lists and individual posts with click-to-load widgets. X is contacted only after those actions; embedding may be blocked or require sign-in.

This uses public source APIs/RSS and optional official embeds. There is no paid X API, unofficial X scraper, new account, or scheduled job. Discovery is cached and may lag source coverage. The panel keeps up to 50 link bookmarks locally, with its own export separate from Library backups.

## Local data and backups

The Library uses IndexedDB in this browser. Ordinary collected items expire after 30 days without being fetched again and are capped at 5,000 records. Saved, followed, noted or collection-assigned items are excluded from automatic pruning. This is application behavior, not protection against clearing browser data, private-mode cleanup or storage eviction. Must read uses a separate local store, keeps up to 200 items, and never evicts Library records. Its unencrypted JSON exports include titles, URLs, source labels, internal story identities and exact added-at timestamps, which can reveal reading interests and timing.

Use **Export backup** in Library regularly. Versioned JSON backups include stories, reading/saved/follow states, notes, collections, saved searches and followed terms; imports validate and merge them. Import limits are 25 MB and 20,000 records. Backups are not encrypted and are not a backup of all app preferences or the separate X bookmarks.

Legacy localStorage saves migrate to IndexedDB. If queue storage cannot be read, the app preserves visible changes in memory and offers a clearly labeled recovery export; it may not contain unreadable stored entries. Export before closing the tab. There is no automatic cross-device account sync.
