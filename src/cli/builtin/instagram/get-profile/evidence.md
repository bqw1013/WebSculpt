# Evidence: instagram/get-profile

This document records the research and validation evidence for the `instagram/get-profile` command.

## Exploration Path

Read guide.md.

Browser automation via `@playwright/cli` attach to the user's logged-in Chrome (session `<session>`, detached). The reels-tab drift (2026-08-23) was re-probed the same way (own tab, network capture, detached).

- Command library check: `websculpt command list instagram` shows only `instagram/search` (browser, GraphQL `/api/graphql` + DOM fallback, friendly name `PolarisKeywordSearchExplorePageRelayQuery`, `after` cursor). No get-profile command existed; this is a new command (`new`).
- The command-family plan was consulted as design input; the contract below is based on actual measured behavior.
- Data path verified via `requests`/`request`/`response-body` on the attached browser: modern Instagram profile pages carry no usable embedded data (`window._sharedData` contains only `platform_install_badge_links`; `window.__additionalDataLoaded` is undefined; `og:description` meta is stale/cached and unreliable for counts). All profile + grid data comes from first-party GraphQL POSTs.

## Verified URLs

- https://www.instagram.com/shopify/ (profile posts tab: header + grid)
- https://www.instagram.com/shopify/reels/ (reels tab; re-verified 2026-08-23 — response now under `data.fetch__XDTUserDict.clips_connection`, pagination doc_id `28143376935350124`)
- https://www.instagram.com/shopify/reposts/ (reposts tab)
- https://www.instagram.com/shopify/tagged/ (tagged tab)
- https://www.instagram.com/lego/ (cross-account generalization: same queries, same schema)

## Structural Evidence

All GraphQL requests are `POST application/x-www-form-urlencoded` to `https://www.instagram.com/graphql/query` (the `/api/graphql` host path also accepts the same form). The request body contains `fb_api_req_friendly_name`, `variables` (URL-encoded JSON), and `doc_id`. Headers seen on native requests include `x-ig-app-id: 936619743392459`, `x-fb-lsd`, `x-csrftoken`.

### Profile header (fires on every tab page load)

- Query: `PolarisProfilePageContentQuery`, doc_id `38611279431804694`
- Variables: `{ "id": "<user numeric id>", "enable_integrity_filters": true, "__relay_internal__pv__..." : ... }`
- Response: `data.user` with fields:
  - `id` / `pk` (numeric user id, e.g. `207642893`), `username`, `full_name`
  - `biography`, `external_url` (null when none), `bio_links[]` (each `{url, lynx_url, link_type}`)
  - `follower_count`, `following_count`, `media_count` (post count)
  - `is_verified` (boolean), `is_private` (boolean), `account_type` (2 = professional)
  - `hd_profile_pic_url_info.url` (avatar, highest res), `profile_pic_url`
  - `total_clips_count` (reel count)
- `data.viewer.user.id` is the logged-in viewer id.
- Real sample (shopify): `{id:"207642893", username:"shopify", full_name:"Shopify", biography:"The entrepreneurship company", external_url:"https://shopify.supply/", follower_count:2601630, following_count:1694, media_count:3702, is_verified:true, is_private:false}`.
- Cross-account sample (lego): `{id:"196743444", username:"lego", full_name:"LEGO", biography:"Building the future, one brick at a time.", external_url:"https://visitlinkin.bio/lego", follower_count:13859429, following_count:918, media_count:6263, is_verified:true}`.

### Posts tab (`/` or `/{user}/`)

- Initial: `PolarisProfilePostsQuery`, doc_id `37691262543822084`
  - Variables: `{ "data": {"count": 12, "include_reel_media_seen_timestamp": true, "include_relationship_info": true, "latest_besties_reel_media": true, "latest_reel_media": true}, "username": "<username>", "__relay_internal__pv__PolarisMultiCaptionCarouselEnabledrelayprovider": true, "__relay_internal__pv__PolarisShortDramaEnabledrelayprovider": false }`
- Pagination: `PolarisProfilePostsTabContentQuery_connection`, doc_id `27698568663128134`, `__crn=comet.igweb.PolarisProfilePostsTabRoute`
  - Variables add: `"after": "<end_cursor>", "before": null, "first": 12, "include_multi_captions": true, "last": null`
- Response root: `data.xdt_api__v1__feed__user_timeline_graphql_connection` → `{ edges[], page_info: {end_cursor, has_next_page, has_previous_page, start_cursor} }`
- Grid media node (`XDTMediaDict`, 12 per page): `code` (shortcode), `media_type` (1 image / 2 video / 8 carousel), `caption.text`, `taken_at` (unix sec), `like_count`, `comment_count`, `view_count` (sometimes null), `image_versions2.candidates[]` (thumbnail URLs), `video_versions[]`, `carousel_media[]`, `accessibility_caption`, `product_type`.
- Real sample node: `{code, media_type:2, taken_at:1786730669, like_count:358, comment_count:47, caption:{text:"..."}}`.
- Scroll loaded a second page (12 → 24 DOM media links); pagination request carries the previous `page_info.end_cursor` as `after`.

### Reels tab (`/{user}/reels/`)

- Initial: `PolarisProfileReelsTabContentQuery`, doc_id `28244684488496159` (re-verified 2026-08-23; previously `38132256686365646`)
  - Variables: `{ "data": {"include_feed_video": true, "page_size": 12, "target_user_id": "<user id>"}, "user_id": "<user id>", "__relay_internal__pv__PolarisShortDramaEnabledrelayprovider": false }`
- Pagination: `PolarisProfileReelsTabContentQuery_connection`, doc_id `28143376935350124` (changed from `27724789533808112` on 2026-08-23), `__crn=comet.igweb.PolarisProfileReelsTabRoute`
  - Variables: `"after": "<end_cursor>", "data": {"include_feed_video": true, "page_size": 12, "target_user_id": "<user id>"}, "first": 5, "id": "<user id>"`
- Response root (2026-08-23 drift): `data.fetch__XDTUserDict.clips_connection` → `{ edges[], page_info: {end_cursor, has_next_page} }`; each edge `node.media` is the reels media node (media_type 2, product_type `clips`). The old root `data.xdt_api__v1__clips__user__connection_v2` has been superseded.
- Reels media node (2026-08-23): reduced shape — `code`, `pk`, `id`, `media_type` (2), `product_type` ("clips"), `play_count`, `like_count`, `comment_count`, `image_versions2.candidates[]`, `user`. It no longer carries `caption` or `taken_at` (command returns `null` for those fields on reels items).
- Cursor: `page_info.end_cursor` (per-edge `cursor` is null); 12 edges on the first page, 5 per pagination page.

### Reposts tab (`/{user}/reposts/`)

- Initial: `PolarisProfileRepostsTabContentQuery`, doc_id `27906964345564087`
  - Variables: `{ "user_id": "<user id>" }`
- Pagination: `PolarisProfileRepostsTabContentRefetchQuery`, doc_id `27999620666337672`
  - Variables: `{ "max_id": "<repost_next_max_id>", "id": "<user id>" }` — max_id style cursor (NOT end_cursor)
- Response root: `data.fetch__XDTUserDict.user_reposts_timeline` → `{ repost_grid_items[], repost_more_available (bool), repost_next_max_id (next cursor) }`
- Each grid item: `{ media: XDTMediaDict }`; `repost_grid_items` length 12 per page.
- IMPORTANT: reposted item links point to the ORIGINAL author's URL (e.g. `/{original-author}/reel/{shortcode}/`), not the profile owner.
- Real sample: `{repost_more_available:true, repost_next_max_id:"QVFG...", repost_grid_items:[{media:{code:"<shortcode>", media_type:2, product_type:"clips", caption:"...", like_count:21, comment_count:4}}]}`.

### Tagged tab (`/{user}/tagged/`)

- Initial: `PolarisProfileTaggedTabContentQuery`, doc_id `27774806538807664`
  - Variables: `{ "count": 12, "user_id": "<user id>" }`
- Pagination: `PolarisProfileTaggedTabContentQuery_connection`, doc_id `27391179227227772`
  - Variables add: `"after": "<end_cursor>", "before": null, "first": 12, "last": null`
- Response root: `data.xdt_api__v1__usertags__user_id__feed_connection` → `{ edges[], page_info: {end_cursor, has_next_page} }`; each edge `node` is the `XDTMediaDict` directly.
- Scroll loaded a second page (12 → 24).

### Pagination summary (cursor mechanics)

| tab | initial friendly name (doc_id) | pagination friendly name (doc_id) | cursor var | cursor source |
|---|---|---|---|---|
| posts | `PolarisProfilePostsQuery` (`37691262543822084`) | `PolarisProfilePostsTabContentQuery_connection` (`27698568663128134`) | `after` + `first:12` | `page_info.end_cursor` |
| reels | `PolarisProfileReelsTabContentQuery` (`28244684488496159`) | `..._connection` (`28143376935350124`) | `after` + `first:5` + `id` | `page_info.end_cursor` |
| reposts | `PolarisProfileRepostsTabContentQuery` (`27906964345564087`) | `PolarisProfileRepostsTabContentRefetchQuery` (`27999620666337672`) | `max_id` | `user_reposts_timeline.repost_next_max_id` |
| tagged | `PolarisProfileTaggedTabContentQuery` (`27774806538807664`) | `..._connection` (`27391179227227772`) | `after` + `first:12` | `page_info.end_cursor` |

### Retrieval strategy (critical)

- Capture real bodies: `page.waitForResponse` matching the friendly name (via `x-fb-friendly-name` header or body `fb_api_req_friendly_name`) to obtain each request's `postData()`, then for the next page reuse that body and only change `variables` (set `after`/`first` or `max_id`), resubmit via `page.evaluate` + `fetch("/graphql/query", ...)` with `content-type: application/x-www-form-urlencoded`, `x-ig-app-id: 936619743392459`, `x-fb-friendly-name` header.
- Hand-built bodies WITHOUT the session params (`fb_dtsg`, `lsd`, `__dyn`, `__req`, ...) return HTML (200 with `<!DOCTYPE html>`); a reused body that is too old returns HTTP 403 HTML (tokens rotate). Therefore ALWAYS reuse a freshly captured body, never hand-construct one.
- Alternative robust path (also verified): let the page itself scroll (real UI) and capture the natural pagination responses via `page.waitForResponse`. This avoids manual body reconstruction entirely. The grid scroll container is the main document (`window.scrollTo(0, document.body.scrollHeight)` triggers lazy load).
- Media `type` mapping from `media_type`: 1 → image, 2 → video, 8 → carousel.

## Failure Signals

- NOT_FOUND / private redirect: navigating to a nonexistent username does not fire the profile queries normally (page redirects / shows "Sorry, this page isn't available"); command should detect no profile response and fail `NOT_FOUND`.
- Private account: `PolarisProfilePageContentQuery` returns `is_private:true` and the grid is empty → command returns profile with `isPrivate:true` and empty posts + `partial:true` (or `EMPTY_RESULT` when a tab is genuinely empty).
- Rate limiting: Instagram rate-limits logged-in accounts on high-frequency GraphQL requests (observed one HTTP 403 HTML on a stale manual fetch). Mitigation: 1.5–3s random waits between pagination requests; let UI scroll progress naturally; never open many detail pages in a row.
- Drift: friendly names / doc_ids can change when Instagram updates its GraphQL layer; `waitForResponse` timeouts or `x-fb-friendly-name` mismatches are the drift signal (throw `DRIFT_DETECTED`).
- `view_count` / `like_count` may be null when counts are hidden or for certain media; keep null-safe.
- Reposts tab may be empty (`repost_more_available:false`, `repost_grid_items:[]`) for accounts that never repost → empty posts + partial.

## Capture Assessment

Capture as a new command `instagram/get-profile`. The path is fully verified in explore (two accounts, all four tabs, real data samples). It is parameterizable (`user`, `tab`, `limit`), stable (first-party GraphQL with documented doc_ids and cursor mechanics), and complements the existing `instagram/search` command (search discovers accounts, get-profile reads a profile). Runtime is `browser` because Instagram requires a logged-in browser session for all data paths. Follower/following full lists are intentionally NOT included (Instagram restricts them to the account owner, verified in explore).
