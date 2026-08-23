# Evidence: instagram/get-reels

This document records the research and validation evidence for the `instagram/get-reels` command.

## Exploration Path

- Explore workspace: a prior explore workspace (audit passed on 2026-08-16).
- Verified path: first-party GraphQL `POST /api/graphql` reusing the initial request's full postData template; cursor pagination via `after`/`seen_reels`; no DOM fallback (DOM unreliable for the full-screen Reels player).
- Command library check: `websculpt command list instagram` shows only `instagram/search`; no conflict for `instagram/get-reels`.
- Reference implementation consulted: the installed `instagram/search` command (same GraphQL pagination pattern).
- Browser used for exploration: session `<session>`, attached to the user's logged-in Chrome.

## Verified URLs

- https://www.instagram.com/reels/ (algorithmic Reels feed; navigates to /reels/{shortcode}/)
- https://www.instagram.com/reels/DYzTUX6vjB5/ (played reel page)
- https://www.instagram.com/reels/DZuGxIMTnlf/ (played reel page after pagination)
- https://www.instagram.com/api/graphql (Reels feed GraphQL pagination endpoint, POST, verified 200)
- https://www.instagram.com/graphql/query (native client endpoint, POST, verified 200)

## Structural Evidence

- Query: friendly name `PolarisClipsTabDesktopPaginationQuery`, root field `xdt_api__v1__clips__home__connection_v2`, `doc_id=28439660052323373`.
- Headers (minimal set that works on `/api/graphql`): `content-type: application/x-www-form-urlencoded`, `x-ig-app-id: 936619743392459`, `x-fb-friendly-name: PolarisClipsTabDesktopPaginationQuery`. (`x-root-field-name` is optional; `/graphql/query` additionally requires `x-csrftoken`/`x-fb-lsd`/`referer`.)
- Request body MUST be the full postData captured from the first request (contains boilerplate params `av`, `fb_dtsg`, `lsd`, `__dyn`, `__comet_req`, etc.). Building the body from scratch (only 4 params) returns HTML/403.
- `variables` JSON shape:
  ```json
  {
    "after": "<page_info.end_cursor>",
    "before": null,
    "data": { "container_module": "clips_tab_desktop_page", "seen_reels": "[{\"id\":\"<media.pk>\"},...]" },
    "first": 10,
    "last": null,
    "__relay_internal__pv__PolarisReelsRecoDebugOverlayEnabledrelayprovider": false,
    "__relay_internal__pv__PolarisShortDramaEnabledrelayprovider": false
  }
  ```
- Response shape: `data.xdt_api__v1__clips__home__connection_v2.edges[].node.media` (XDTMediaDict) plus `page_info{end_cursor, has_next_page, has_previous_page, start_cursor}`.
- Edges per page varies (observed 4 / 14 / 15), not strictly equal to `first`.
- Field mapping per reel (verified real samples):
  - `shortcode` = `media.code`
  - `url` = `https://www.instagram.com/reels/{code}/`
  - `author` = `{ username: media.user.username, profileUrl: https://www.instagram.com/{username}/, isVerified: media.user.is_verified }`
  - `caption` = `media.caption.text`
  - `likeCount` = `media.like_count`
  - `commentCount` = `media.comment_count`
  - `shareCount` = `media.media_repost_count`
  - `videoUrl` = last (highest quality) entry of `media.video_versions[].url`
  - `timestamp` = `media.taken_at` (unix seconds)
  - `mediaId` = `media.pk` (used for `seen_reels` dedup)
- Dedup keys: accumulated `media.pk` values in `variables.data.seen_reels` to avoid repeats across pages.
- Pagination loop: set `variables.after` = previous page `page_info.end_cursor`; stop when `page_info.has_next_page` is false or the limit is reached.
- Natural client behavior: navigating to `/reels/` fires the query once; the UI preloads batches and only fires the next query when the video buffer runs low. The command can call the API in a loop directly without scrolling.

## Failure Signals

- Building the request body from scratch (only `fb_api_req_friendly_name` + `doc_id` + `variables`) → HTTP 200 HTML shell or 403. Must reuse the captured full postData.
- `/graphql/query` without `x-csrftoken`/`x-fb-lsd`/`referer` headers → 403. `/api/graphql` with the minimal header set works.
- DOM extraction is unreliable: the full-screen player preloads adjacent reels, so a single-page selector sweep mixes counts from multiple reels (e.g. `["1.3万","102","233","5598","6235","368"]`) and the author link may match a recommendation, not the current reel. Hence GraphQL only, no DOM fallback.
- `seen_reels` not accumulating → repeated reels across pages.
- Login/session required; without a logged-in session the endpoint returns the login HTML shell.
- Instagram enforces strict rate limiting; space requests 1.5-3s apart.

## Capture Assessment

This command should be captured. The path is fully verified (initial load, natural pagination, and scripted replay all returned valid GraphQL 200 responses with real reel data). The first-party GraphQL endpoint with postData-template replay is stable, parameterizable by `limit`, and complements the existing `instagram/search`. A list command for the Reels feed is a high-reuse capability for the Instagram command family.
