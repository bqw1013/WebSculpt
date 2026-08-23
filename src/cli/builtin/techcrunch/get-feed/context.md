# Context

## Precipitation Background (Why This Command Exists)

Precipitated on 2026-08-14 as a rename/migration of the existing `techcrunch/get-latest` command (installed locally). The old command exposed raw `per_page`/`page` pagination with the ambiguous name "get-latest". Per the command-family plan, it is renamed to `get-feed` (consistent with the `get-feed` naming across huxiu/medium/quora) and switched to a `limit` style with internal auto-pagination and `partial=true` on stream exhaustion. The 23-category filter is unchanged (re-verified against the live `/wp/v2/categories` endpoint).

## Value Assessment

General and reusable: one call returns the core TechCrunch content-consumption surface (the chronological feed behind `/latest/` and every editorial category page). Public API, no auth, no browser, fast (1 request for `limit<=100`). The `category` enum makes the command self-documenting. Output cards (title/url/date/excerpt/image/categories) chain directly into downstream commands like `get-article` (via `url`), `get-topic` (via topic slugs), and translation/summarization.

## Page Structure

- Feed API: `GET https://techcrunch.com/wp-json/wp/v2/posts`
  - Query params: `per_page` (1-100), `page` (1-based), `_fields`, optional `categories={id}`.
  - Response: JSON array of post objects (minimized to `id,date,link,title,excerpt,jetpack_featured_media_url,categories` via `_fields`).
  - Headers: `X-WP-Total` (total posts), `X-WP-TotalPages` (total pages). Full stream: 261766 posts / 2618 pages @100.
- Category id map lives in `command.js` as `CATEGORY_MAP` (23 editorial slugs -> WP category IDs). Reverse map `ID_TO_SLUG` renders each post's `categories` array as slugs (non-editorial IDs like `tc`=17396 are dropped).
- Post types: the API returns `post`, `tc_podcast`, `tc_video` for category feeds (category pages DO render podcast/video cards interleaved); the `/latest/` feed is `post`-only. The `type=` query param is IGNORED by the API, so no type filter is attempted.
- Ordering: verified that API results match `/latest/`, `/latest/page/2/`, `/category/artificial-intelligence/`, and `/category/startups/` HTML order exactly.

## Environment Dependencies

- No login, no browser. Verified via in-browser fetch and raw local curl (both HTTP 200; no UA/Referer validation).
- Polite pacing: a randomized 200-700 ms delay is applied before each request (per access-politeness policy, without noticeably slowing the command). For `limit<=100` this is a single request, so the delay is negligible.
- Node runtime; only global `fetch`/`console` and Node built-ins are used.

## Failure Signals

- HTTP 400 on `page` beyond the last page -> stream exhausted: set `partial=true`, stop (not an error).
- HTTP 200 with `[]` -> empty stream (category with no posts, or feed ran out): `partial=true`, stop.
- Non-2xx on a normal request -> `API_ERROR` (rate limiting or API change).
- `type=` query param is silently ignored by the API; do not rely on it.
- Unknown `category` slug -> `INVALID_CATEGORY` (error lists all 23 valid slugs).
- Out-of-range / non-numeric `limit` -> `INVALID_PARAM`.
- Response no longer an array -> `DRIFT_DETECTED` (WP API shape change).

## Repair Clues

- If the API host or REST base changes, update the `https://techcrunch.com/wp-json/wp/v2/posts` URL in `command.js`.
- If category taxonomy changes, re-fetch `/wp/v2/categories` and update `CATEGORY_MAP` (source of truth: the 25 entries, minus `ben-test-2` test residue and `tc` meta category = 23 editorial).
- If a post field is missing (e.g. `jetpack_featured_media_url` becomes null), the mapping already falls back to `""`; only revisit if the API replaces the featured-image field name.
- The old `techcrunch/get-latest` command remains installed and can be compared/replaced per the disposition decision in the capture report.
