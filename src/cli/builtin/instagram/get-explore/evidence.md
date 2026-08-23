# Evidence: instagram/get-explore

This document records the research and validation evidence for the `instagram/get-explore` command.

## Exploration Path

- Command library check: `websculpt command list instagram` shows a single existing command `instagram/search` (browser runtime, logged-in session). No explore-grid command exists; this is a new command, no conflict.
- Browser automation guide consulted. Explored with Playwright CLI session `<session>` attached to the user's logged-in Chrome (2026-08-16).
- Verified via page-internal `fetch` calls to the first-party REST endpoint, plus a real end-to-end mini capture simulation (limit=20, 2 pages, 20 records, no overlap).

## Verified URLs

- `https://www.instagram.com/explore/` — the Explore grid page (algorithmic recommendations, personalized to the logged-in account). Initial render ~20 media cards via GraphQL bootstrap.
- `https://www.instagram.com/api/v1/discover/web/explore_grid/?include_fixed_destinations=true&is_nonpersonalized_explore=false&is_prefetch=false&module=explore_popular&omit_cover_media=false` — the first-party REST API backing the grid. Scroll-triggered loading and pagination use this endpoint with a `max_id` cursor.

## Structural Evidence

### API endpoint and request

- Method: GET `https://www.instagram.com/api/v1/discover/web/explore_grid/`
- Fixed query params (verified from the browser's natural scroll request):
  - `include_fixed_destinations=true`, `is_nonpersonalized_explore=false`, `is_prefetch=false`, `module=explore_popular`, `omit_cover_media=false`
- Pagination param: `max_id=<cursor>` (URL-encoded opaque token) — omitted on the first page.
- Only two headers are required for a 200 (verified by direct page-internal fetch):
  - `x-ig-app-id: 936619743392459`
  - `x-requested-with: XMLHttpRequest`
- Response: HTTP 200, `application/json`, `status: "ok"`.

### Response structure (media grid)

Top-level keys: `sectional_items` (media sections), `rank_token`, `auto_load_more_enabled` (true), `more_available` (pagination flag), `next_max_id`, `max_id` (cursor for the next page), `session_paging_token`, `clusters`, `status: "ok"`.

Media lives inside `sectional_items[]`, but in two different shapes:

- Page 1 (no `max_id`): `sectional_items[]` → `layout_type: "one_by_two_right" | "one_by_two_left"` → `layout_content.fill_items[]` → `{ media: {...} }`. ~15-16 items per page.
- Page 2+ (with `max_id`): `sectional_items[]` → `layout_type: "dynamic_grid"`, `feed_type: "media"` → `layout_content.medias[]` (a plain array of media objects). ~12 items per page.
- Robust extraction: recursively walk `sectional_items` and collect any object that has a `.code` string field (i.e. the media objects). This handles both shapes.

Media object fields (verified real sample):

- `code` — shortcode (used for `url` and dedup).
- `media_type` — numeric; observed 1=image, 2=video (has `video_versions`), 8=carousel (has `carousel_media` array + `carousel_media_count`).
- `caption.text` — caption string.
- `like_count`, `comment_count` — numbers (may be absent on some items).
- `image_versions2.candidates[0].url` — thumbnail (largest/first candidate; verified present on image, video, and carousel items).
- `video_versions[]` — present on video items.
- `carousel_media[]` — present on carousel items.

Type classification (structural, not numeric): `carousel_media` non-empty → `carousel`; `video_versions` non-empty → `video`; else → `image`.

### Pagination

- Cursor: response `max_id` field → sent as `max_id` query param for the next request.
- `more_available` flag indicates more pages. Verified across 3 pages: always `true`, 0 media overlap between adjacent pages. The Explore stream is effectively unbounded — capture stops by `limit`, and `partial=true` only when the stream stops producing before `limit` is reached.
- Page-1 item count ~15-16, subsequent pages ~12. To reach limit=20, 2 pages suffice; limit=100 needs ~7-8 pages.

### DOM fallback (used only if the API fails)

- Selector: `a[href*="/p/"], a[href*="/reel/"]`.
- Extract shortcode from href with `/\/(?:p|reel)\/([^/?#]+)/`; dedupe by shortcode.
- Thumbnail from the nested `img.src` (may be null while lazy-loading). `type` is unknown in DOM mode.
- Important: the grid DOM is virtualized — off-screen cards are unmounted (observed card count drop 56 → 39 while scrolling). DOM extraction is therefore viewport-limited and only a fallback.

## Failure Signals

- `x-ig-app-id` / `x-requested-with` missing → non-200 or login wall. If the session is not logged in, the endpoint may return 403 or the page may redirect to a login wall → `AUTH_REQUIRED`.
- HTTP non-ok from the API → `API_ERROR`.
- `sectional_items` absent or `status != "ok"` → `DRIFT_DETECTED` (API structure changed).
- `more_available` false with no new media → stream exhausted → `partial=true` (grid stopped before limit).
- 429 / repeated failures → Instagram rate limiting; requests must be spaced (random 1.5-2.5s between pagination calls). If both API and DOM fallback fail → `DRIFT_DETECTED`.
- Explore content is personalized and changes on every run (verified: page 1 and page 2+ differ every call); structural stability, not content stability, is the contract.

## Capture Assessment

The path is verified end-to-end: page-internal fetch to the `explore_grid` REST endpoint with `max_id` cursor pagination reproduces the same media grid the page renders on scroll, with zero overlap between pages and a stable media object schema. A real mini-capture (limit=20) returned 20 records across 2 pages (8 video / 9 carousel / 3 image) with shortcode, url, type, thumbnail, likeCount, commentCount all present. The path is parameterizable (limit) and worth capturing as `instagram/get-explore` (browser runtime, requires a logged-in Instagram session).
