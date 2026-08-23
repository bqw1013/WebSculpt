# Evidence: techcrunch/get-author

This document records the research and validation evidence for the `techcrunch/get-author` command.

## Exploration Path

- Library check: `websculpt command list techcrunch` shows existing commands `techcrunch/get-latest` and the in-progress `techcrunch/get-article`, `techcrunch/search`, `techcrunch/get-feed` workspaces. No name conflict with `techcrunch/get-author`.
- Source plan: the command-family plan section 4 (`techcrunch/get-author`) — treated as a design suggestion. First-hand testing (below) overrides the plan where they disagree.
- Runtime contract consulted before drafting `command.js` (node runtime, no third-party deps, no inline import, regex HTML parsing required).
- Browser DOM verification: attached to the user's Chrome via Playwright CLI on 2026-08-14 to inspect the real rendered author archive page DOM.
- API channels ruled out (verified in plan exploration): WP `users` endpoint returns 404 and `posts?author=` returns an empty array, so the author archive must be parsed from the server-rendered HTML at `https://techcrunch.com/author/{slug}/`.

## Verified URLs

- https://techcrunch.com/author/lucas-ropek/ — 200, valid author archive (30 cards/page, hero present, 7 pages total)
- https://techcrunch.com/author/lucas-ropek/page/2/ — 200, paginated page (30 cards, next link to page/3, previous link to page 1)
- https://techcrunch.com/author/lucas-ropek/page/7/ — 200, last page (3 cards, no next link, title "Page 7 of 7")
- https://techcrunch.com/author/lucas-ropek/page/8/ — 404 (page beyond last)
- https://techcrunch.com/author/lucas-ropek/page/999/ — 404 (deep page beyond last)
- https://techcrunch.com/author/brian-heater/ — 200, second author (no position meta line, 3 cards without featured images — confirms optional fields)
- https://techcrunch.com/author/this-author-does-not-exist-xyz/ — 404, title "Page not found | TechCrunch"

## Structural Evidence

- The archive is server-rendered HTML; plain `fetch`/curl returns the full markup (verified with curl, ~280KB/page, and node `fetch` returns the same). No browser, no auth, no JS needed. Node runtime.
- Classic pagination: page 1 = `/author/{slug}/`, page N = `/author/{slug}/page/N/`. Page size is 30 cards (not 20 as the plan suggested; the plan is overridden here).
- Author hero block (class `author-hero`, container `div.wp-block-techcrunch-author-archive-hero`):
  - Name: `h1.wp-block-techcrunch-author-archive-hero__title` (text, e.g. "Lucas Ropek")
  - Position/meta line (OPTIONAL): `p.wp-block-techcrunch-author-archive-hero__meta` (e.g. "Senior Writer, TechCrunch"; absent for some authors like Brian Heater)
  - Bio (OPTIONAL): `div.wp-block-techcrunch-author-archive-hero__bio` (text; may contain newlines and plain text only)
  - Avatar (OPTIONAL): `figure.tc23-author-archive-hero__media img` `src` (may carry a `?w=NNN` resize query)
- Article cards: `<ul class="wp-block-post-template">` → `<li class="wp-block-post ...">` (one per article). Only the content column has cards; the sidebar and footer contain no `.wp-block-post` elements.
  - Categories: the `<li>` class attribute contains `category-{slug}` tokens (true editorial WP categories). Display label `span.loop-card__cat` mixes tags and category display names, so slugs from the li class are used instead. `category-tc` (meta category) and `category-ben-test-2` (test residue) are filtered out.
  - Featured image (OPTIONAL): `figure.loop-card__figure img` (class contains `wp-post-image`); some cards have none. `src` may carry a `?w=NNN` query which is stripped for a canonical URL.
  - Title + URL: `a.loop-card__title-link` — `href` is the article URL, element text is the title (HTML entities like `&#8216;` need decoding).
  - Date: `time.loop-card__time` `datetime` attribute = full ISO-8601 with timezone offset (e.g. `2026-08-13T12:22:40-07:00`). The visible text is a relative time ("10 hours ago"), so the `datetime` attribute is used.
  - EXCERPT: NOT PRESENT. Cards render only category label, title, author(s), and time. Verified across two authors (60 cards total): zero cards contain an excerpt element or long text. The plan's `excerpt` field is therefore emitted as an empty string; callers should treat it as unavailable on this page. (Deviates from plan schema shape by value only — field retained for schema stability.)
- Pagination control: `a.wp-block-query-pagination-next` (attribute order: `href` before `class`). Its `href` is the next page URL. On the last page the anchor is absent (only the CSS class definition remains, which the regex does not match).
- HTTP status contract: valid author → 200; nonexistent author slug → 404 (title "Page not found | TechCrunch"); page beyond last → 404.
- Total archive size for a sample author (lucas-ropek): 7 pages × 30 + 3 = 183 articles (newest first).

## Failure Signals

- `HTTP 404` on the first page → author slug does not exist → `NOT_FOUND` (checked before any parse).
- `HTTP 404` on a follow-up page → archive exhausted mid-pagination → stop silently (defensive; normally the missing next link already stops pagination).
- Non-2xx non-404 status → `HTTP_ERROR` with the status code.
- Network failure → `NETWORK_ERROR`.
- Missing/blank `author` → `MISSING_PARAM`; author slug that is not lowercase-hyphenated → `INVALID_PARAM` (both before any request).
- Invalid `limit` (NaN, <1, >100) → `INVALID_PARAM` before any request (no silent clamping).
- Author slug validation must be lenient: real slugs can contain uppercase letters (verified: `margaux-macColl` returns 200). Only reject empty (MISSING_PARAM) or strings with characters that would break the URL path (INVALID_PARAM).
- Hero selectors or card markers absent on a 200 page (e.g. no `wp-block-techcrunch-author-archive-hero__title`, no `loop-card__title-link`) → `DRIFT_DETECTED` (site structure changed).
- A valid author with zero visible cards returns an empty `articles` array (legitimate empty state, not an error).
- Polite pacing: TechCrunch serves the archive to plain HTTP clients, but to keep cadence moderate the command sleeps a random 200–700ms before each page request and paginates serially. No 429/403 was observed during verification; a handful of requests per command is well within observed tolerance.

## Capture Assessment

Captured as `techcrunch/get-author`: it is the only way to enumerate a TechCrunch author's profile and articles, because the WordPress `users` API is disabled and `posts?author=` is empty — the author archive page is the verified channel. This is one of the few TechCrunch commands that parse HTML rather than the WP REST API. Node runtime, no auth, no browser. Output: author profile (`name`, `slug`, `profileUrl`, `avatar?`, `bio?`) plus article cards (`title`, `url`, `date`, `excerpt` [always empty — not rendered on this page], `image`, `categories[]`), `partial` flag when the archive is exhausted before reaching the limit. Proceed to capture.
