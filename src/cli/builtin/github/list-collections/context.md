# Context

## Precipitation Background (Why This Command Exists)

User-facing need: browse GitHub's curated Collections (收藏集) — the A-Z list at `github.com/collections`. This is one command in a planned GitHub browser-runtime batch. The batch avoids the GitHub REST API entirely (anonymous quota 60 req/hr, Search 10 req/min) in favor of reading rendered pages, which are not subject to API quotas as long as request frequency is controlled.

## Value Assessment

- Reusable: single fixed SSR page, stable 20-card A-Z index, fast single-call extraction.
- Avoids API quota entirely; only site-level rate limits apply (not reached with normal use).
- Chains well with a future detail command: each `url` is an absolute `/collections/<slug>` link.
- Sibling `github/list-topics` is captured separately; `list-collections` does not overlap with it (collections ≠ topics).

## Page Structure

- URL: `https://github.com/collections` — pure SSR, single fixed page, no pagination.
- Stable A-Z index cards: selector `article.d-flex.border-bottom` (20 cards):
  - `title` = `h2.h3 a` innerText
  - `url` = `h2.h3 a[href]` → prefix `https://github.com`
  - `description` = text node inside `.col-10` right after the `<h2>`; extract by cloning `.col-10`, removing `h2`, reading `innerText` and collapsing whitespace.
- Rotating "featured" spotlight (top): `a.exploregrid-item` (3 cards, cover image). Excluded — it rotates across sessions (observed anonymous vs logged-in differences) and includes collections absent from the A-Z index.
- Verified identical 20-card index across anonymous curl and logged-in browser (same slugs/titles/descriptions).

## Environment Dependencies

- `browser` runtime: daemon connects over CDP to the user's Chrome/Edge (independent of the explore-phase `@playwright/cli` attach). No login required (public page). First attach may pop a Chrome "allow remote debugging" system dialog; if the user clicks slowly, commands may return `BROWSER_ATTACH_REQUIRED` — confirm remote debugging is enabled before deeper debugging.
- Rate awareness: random pre-nav delay + random mouse move/wheel + short random wait. Single call target ≤10s. Keep requests serial; avoid bursts.

## Failure Signals

- 429/403 from the `goto` response, or a title/body containing `whoa there|captcha|rate limit|access denied|unusual traffic` → `NETWORK_ERROR` (bot check / rate limit). Slow down and retry.
- HTTP 404 → `NOT_FOUND`.
- Page loads (200) but `article.d-flex.border-bottom` matches 0 nodes → `DRIFT_DETECTED` (structure changed; e.g., GitHub renamed the card class).

## Repair Clues

- If the article card selector drifts, inspect the raw SSR HTML for the new card container (look for `article.d-flex.border-bottom` or its replacement) and update both the selector and this context.
- Fallback alternative if the DOM read fails: same-origin `fetch(location.pathname)` + `DOMParser` (pattern used by `github/get-trending`) to read pristine SSR HTML.
- If the page starts serving the collections list via a different route/query param, update the URL in `command.js` and record it here.
- Verify the index is still exactly 20 cards before reusing; if GitHub adds more collections, `available` changes and `limit` semantics still hold (truncation), but the "always 20" note in the README must be revisited.
