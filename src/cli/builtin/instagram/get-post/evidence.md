# Evidence: instagram/get-post

This document records the research and validation evidence for the `instagram/get-post` command.

## Exploration Path

- Explored in a prior explore workspace (trace.md audited, `explore assess` passed 2026-08-16).
- Command library check: `websculpt command list instagram` shows only `instagram/search`. No existing get-post command; search returns media cards only (no full caption / comments / nested replies), so a new command was explored.
- Playwright session `<session>` attached to the user's logged-in Chrome.
- Browser runtime contract doc read.

## Verified URLs

- https://www.instagram.com/p/Dbv-ZWKkfop/ — shopify carousel post; verified like_count 592 / comment_count 104 / caption / 4 carousel items (media_type 8, product_type carousel_container).
- https://www.instagram.com/shopify/p/Dbv-ZWKkfop/ — username-prefixed post URL form; renders identically, no redirect.
- https://www.instagram.com/reel/Dau_m7dP2DH/ — 301 redirects to https://www.instagram.com/reels/Dau_m7dP2DH/ (reels browse feed, different embedded structure `xdt_api__v1__clips__home__connection_v2`).
- https://www.instagram.com/p/Dau_m7dP2DH/ — same reel served as a post-style page (product_type "clips"); full data + comments retrievable.
- https://www.instagram.com/p/DW4yxikkyoX/ — another reel via /p/ form (media_id 3871067186425702935, comment_count 46).
- API: `POST https://www.instagram.com/api/graphql` (queries distinguished by `x-fb-friendly-name`; responses wrapped in `for (;;);` XSSI prefix).

## Structural Evidence

### Post data (posts AND reels, via `/p/{shortcode}/`)
- Page data is NOT in `window._sharedData` (empty shell) and NOT in a page-issued GraphQL request. It is embedded as a RelayPrefetchedStreamCache payload inside `<script type="application/json">`.
- Stable locate key: `xdt_api__v1__media__shortcode__web_info` — scan all `script[type="application/json"]` text recursively for this key; the post is `items[0]` of that object. Independent of script index.
- `items[0]` fields (native XDTMediaDict):
  ```
  code (shortcode), pk (media_id, string)
  taken_at (unix seconds)
  product_type: "carousel_container" | "clips" | "image_container" | "video_container"
  media_type: 1 image | 2 video | 8 carousel
  caption: { text, pk, has_translation, created_at }
  like_count, comment_count (numbers)
  hidden_likes_string_variant: -1 when likes are hidden (common on reels)
  user: { username, full_name, profile_pic_url, is_verified, pk }
  image_versions2.candidates[] -> { url, width, height }
  video_versions[] -> { url, width, height }
  carousel_media[] -> array of child items, each with image_versions2 and/or video_versions, media_type
  ```
- Verified sample (Dbv-ZWKkfop): code "Dbv-ZWKkfop", pk "3958657018152221225", like_count 592, comment_count 104, product_type "carousel_container", 4 carousel items each with video_versions.
- Verified reel sample (Dau_m7dP2DH via /p/): product_type "clips", like_count is a placeholder 3 while `hidden_likes_string_variant=-1`; DOM shows comment_count 5598 / play 6236. Normal posts report accurate like_count.

### Top-level comment pagination
- Query friendly name: `PolarisPostCommentsPaginationQuery`, doc_id `28082902984733691`.
- variables: `{ after: "<serialized cursor or null>", before: null, first: N, last: null, media_id: "<pk>", sort_order: "popular", __relay_internal__pv__PolarisIsLoggedInrelayprovider: true }`.
- Response path: `data.xdt_api__v1__media__media_id__comments__connection`:
  ```
  edges[].node = XDTCommentDict {
    user: { username, pk, profile_pic_url, is_verified },
    pk (comment id), text, created_at (unix seconds),
    comment_like_count, child_comment_count, parent_comment_id (null for top-level),
    has_translation, __typename: "XDTCommentDict"
  }
  page_info: { end_cursor: "{\"cached_comments_cursor\":\"...\",\"bifilter_token\":\"...\"}", has_next_page }
  ```
- `after` for next page = previous `page_info.end_cursor`. Verified: first call with `after:null` returns page (14–15 edges); end_cursor feeds next page.

### Nested replies
- Query friendly name: `PolarisPostChildCommentsQuery`, doc_id `27823744063932558`.
- variables: `{ after: null, before: null, media_id: "<pk>", parent_comment_id: "<comment pk>", is_chronological: null, first: null, last: null, __relay_internal__pv__PolarisIsLoggedInrelayprovider: true }`.
- Response path: `data.xdt_api__v1__media__media_id__comments__parent_comment_id__child_comments__connection.edges[].node` (same XDTCommentDict shape).
- DOM trigger: the "查看所有N条回复" ("view all N replies") leaf text node; walk up to `role=button` ancestor; dispatch pointerdown/mousedown/mouseup/click events -> fires this GraphQL. Reply data comes from GraphQL, not pre-embedded in DOM. After expand the button becomes "隐藏所有回复".

### Request body template / direct-call mechanism
- Reuse a real `/api/graphql` request body as template: capture `request.postData()` via `page.waitForResponse`, then in `page.evaluate` re-POST with `fb_api_req_friendly_name`, `doc_id` and `variables` replaced. Verified end-to-end: captured `PolarisPostChildCommentsQuery` body, re-issued as `PolarisPostCommentsPaginationQuery` with media_id 3958657018152221225 -> status 200, 14 edges, valid end_cursor; same for reel media_id 3940366476107538631 -> status 200, 15 edges.
- `window.fb_dtsg` and `window.lsd` exist but a full body also needs `__dyn/__s/__hsi/__hs/av/__rev/jazoest`; synthesizing without a captured body yields error 1357004.
- GraphQL responses begin with `for (;;);` — in page context strip with `.replace(/^for \(;;\);/, '')` before `JSON.parse`.

### URL normalization / shortcode
- Accepted URL forms: `/p/{shortcode}/`, `/{username}/p/{shortcode}/`, `/reel/{shortcode}/` (must normalize to `/p/{shortcode}/` because `/reel/` 301-redirects to `/reels/` browse feed with a different structure).
- shortcode regex: `/(?:p|reel|reels)\/([^/?#]+)/`.

## Failure Signals

- Unauthenticated session: comment GraphQL or page data missing -> AUTH_REQUIRED style failure; sign in required.
- Non-existent shortcode: page shows "Sorry, this page isn't available" or no `xdt_api__v1__media__shortcode__web_info` key -> NOT_FOUND / DRIFT_DETECTED.
- `xdt_api__v1__media__shortcode__web_info` absent on a valid post = structure drift -> DRIFT_DETECTED.
- GraphQL error code 1357004 = invalid/missing tokens (fb_dtsg/lsd) -> re-capture body template.
- `/api/graphql` responses wrapped in `for (;;);`; `fetch().json()` throws SyntaxError unless stripped.
- Reel posts may hide like counts (`hidden_likes_string_variant: -1`); `like_count` is a placeholder — output should note it.
- Rate limiting / polite pacing: keep 1.5–3s random waits between requests; avoid rapid-fire pagination on hot posts.
- Clicking the comment count button on a reel /p/ page does NOT reliably trigger pagination (Relay cache / button semantics) — always call the API directly, never depend on DOM clicks for comment data.

## Capture Assessment

The path is fully verified in explore: post data via embedded `web_info` JSON works for both posts and reels (after `/p/` normalization); comments via two first-party GraphQL queries with cursor pagination and nested-reply expansion; direct re-issue of a captured request body works. This is a stable, reusable command that fills the gap left by `instagram/search` (which only returns list cards). Candidate `instagram/get-post` is captured.
