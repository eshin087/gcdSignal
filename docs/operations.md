# Operation and verification

## Firewall
Production project: gcdsignal. On 2026-09-07 the existing Vercel Hobby allowance had no custom rules and no pending draft changes.

The approved rule **Signal API budget** (ID: rule_signal_api_budget_5qB3k4) was published and verified live:

- Match path starts with /api/feeds/ OR path equals /api/brief.
- Fixed window, 60 requests per 60 seconds, keyed by client IP.
- Exceeded requests receive rate-limit mitigation.
- No existing rule was overwritten; no paid plan or service was enabled.
- /api/warm retains separate bearer-secret authentication.

Check with "vercel firewall rules list" and "vercel firewall diff". Do not publish unrelated drafts. To adjust or disable this rule, inspect that exact ID first. The general "firewall overview" command may fail on Hobby because it also requests a paid IP-bypass feature; listing custom rules works.

## Cache and coverage
Both views share normalized five-minute source results. The server's shared result and last-good caches are bounded per-instance caches, not a durable database or a cross-instance distributed lock. CDN/framework caches reduce repeated work; a cold instance may have no last-good value. Never describe the local cache as a coverage guarantee.

Brief starts with the primary reporting phase, then loads the complete phase. Failed publishers remain in health details. The browser displays available cached content and holds reordered Brief results while the reader is scrolled down. Manual refresh does not bypass upstream caches.

The warm workflow checks body-level health, not only HTTP 200. Partial upstream outages should be investigated by publisher/source rather than treated as a site-wide failure.

## Security policy rollout
Security headers are enabled; CSP remains **report-only**. The two pre-paint scripts are hash-allowed. Official X widget origins are narrowly listed, and X is click-to-load. Next-generated inline hydration/RSC scripts still require a deliberate policy before CSP enforcement; no claim is made that report-only CSP blocks attacks.

After deployment, inspect a cold page and an X widget in a browser, review legitimate policy violations, and only enforce a policy after valid content and scripts work. Do not add broad wildcards or enable arbitrary inline scripts to silence reports.

## Personal data
Library data stays in this browser's IndexedDB. Backups contain story links, excerpts, personal notes, saved searches and follows, and should be treated as personal data. No server-side account/sync service exists. Do not clear browser site data before exporting. X link bookmarks have a separate Export X links action.

Newsletter UI, subscriber/digest endpoints, email cron and email dependency were removed. No external subscriber record, account or secret was deleted.

## Verification commands

- npm ci
- npm test
- npm run lint
- npm run build
- npm audit
- Start production locally: node node_modules/next/dist/bin/next start -p 3001.
- Run node tests/browser-smoke.mjs with APP_URL=http://127.0.0.1:3001 for reader regressions.
- Run node tests/library-browser.mjs for real IndexedDB migration/reload checks.
- Both use the pinned Playwright dependency and installed Chrome by default; CI installs Chromium and selects BROWSER_CHANNEL=chromium.

Browser fixtures must intercept upstream API requests and test local servers only. The automated reader tests are not field Core Web Vitals; the separate browser spot check should state cache state and network conditions.
