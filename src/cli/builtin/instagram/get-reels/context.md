# Context

## Precipitation Background (Why This Command Exists)

Instagram's Reels feed is the algorithmic short-video discovery surface. It was explored and verified on 2026-08-16. The list command serves hot/trending short-video discovery; comments are handled by `instagram/get-post`.

## Value Assessment

High reuse: Reels is one of Instagram's core surfaces and complements the existing `instagram/search`. The GraphQL path is stable and parameterizable by `limit`; reuses the same postData-template-replay pattern as `instagram/search`, so it is low-maintenance once verified.

## Page Structure

- Feed page: `https://www.instagram.com/reels/` — the full-screen Reels player navigates to `/reels/{shortcode}/` for the playing reel.
- Data source: `POST /api/graphql`
  - friendly name `PolarisClipsTabDesktopPaginationQuery`, root field `xdt_api__v1__clips__home__connection_v2`, `doc_id=28439660052323373`, `x-ig-app-id=936619743392459`.
  - Minimal headers that work: `content-type: application/x-www-form-urlencoded`, `x-ig-app-id`, `x-fb-friendly-name`. (`x-root-field-name` optional. Native client also uses `/graphql/query` which additionally needs `x-csrftoken`/`x-fb-lsd`/`referer`.)
  - Body must be the FULL postData captured from the first request (boilerplate `av`/`fb_dtsg`/`lsd`/`__dyn`/`__comet_req` etc.); building it from scratch returns HTML/403.
  - `variables`: `{ after, before, data: { container_module: "clips_tab_desktop_page", seen_reels: "[{\"id\":\"<pk>\"},...]" }, first: 10, last }`.
- Response: `data.xdt_api__v1__clips__home__connection_v2.edges[].node.media` (XDTMediaDict) + `page_info{end_cursor, has_next_page}`. Edges per page varies (observed 4/14/15), not strictly `first`.
- Field mapping: `code`, `user{username,is_verified}`, `caption.text`, `like_count`, `comment_count`, `media_repost_count`, `video_versions[].url`, `taken_at`, `pk`.

## Environment Dependencies

- Requires a logged-in Instagram browser session (Chrome/Edge with remote debugging). Instagram has no public API.
- Polite pacing: space pagination requests 1.5-3s apart; do not hammer. Instagram enforces strict rate limiting (429 / challenge).

## Failure Signals

- Request body built from scratch → HTTP 200 HTML shell or 403.
- `/graphql/query` without `x-csrftoken`/`x-fb-lsd`/`referer` → 403; `/api/graphql` with minimal headers works.
- `seen_reels` not accumulated → repeated reels across pages.
- Not logged in → Reels query never fires; `waitForResponse` times out → `DRIFT_DETECTED`.
- DOM is unreliable for this surface (full-screen player preloads adjacent reels, mixing counts/authors), so there is deliberately NO DOM fallback.

## Repair Clues

- If `waitForResponse` never resolves, first check the user is logged in and the browser attach is healthy (BROWSER_ATTACH_REQUIRED is handled by the runner).
- If the response schema changes, re-capture a live request from the Reels page and update `collectPage` field names / `xdt_api__v1__clips__home__connection_v2` root key.
- If pagination returns 403, check whether the captured postData's `fb_dtsg`/`lsd` are stale; reload `/reels/` to capture a fresh template.
- If the friendly name changes, update `REELS_FRIENDLY_NAME`, `REELS_DOC_ID`, and `REELS_ROOT_FIELD` constants together.
