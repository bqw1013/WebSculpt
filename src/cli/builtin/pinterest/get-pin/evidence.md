# Evidence: pinterest/get-pin

This document records the research and validation evidence for the `pinterest/get-pin` command.

## Exploration Path

- Command library check: `websculpt command list pinterest` shows only `pinterest/search` exists. No `get-pin`; this is a new command (library relation: new).
- Explore verified (audit passed, `explore assess` status: passed).
- Browser exploration used `@playwright/cli` attached to the user's logged-in Chrome via CDP. Browser automation guide read before explore.
- Login state verified.

## Verified URLs

- `https://www.pinterest.com/pin/1095219203159229945/` — image Pin detail page. SSR fields, comment section, and related Pins all extracted here.
- `https://www.pinterest.com/pin/961237114245882060/` — video Pin detail page ("Gut Healing Jello"). HLS video variants and high-comment-count pagination extracted here.
- `https://www.pinterest.com/pin/999999999999999999/` — non-existent Pin id. Confirmed it 302-redirects to `https://www.pinterest.com/?show_error=true` (NOT_FOUND detection).
- `https://v1.pinimg.com/videos/mc/hls/96/dd/fb/96ddfb7da147d8b5ea6d4721a5d65a8f.m3u8` — HLS master playlist (HTTP 200, `application/x-mpegURL`), containing `{240w,360w,480w,640w,720w}` variant playlists plus an `_audio.m3u8` audio track.

## Structural Evidence

### Primary data source (SSR, no interaction needed)

- Pin detail pages embed `<script id="__PWS_INITIAL_PROPS__" type="application/json">`. Parse it and read `initialReduxState.pins[<id>]`.
- The pin object field mapping (all verified on the two real Pins):
  - `id` — string pin id (e.g. `"1095219203159229945"`).
  - `closeup_unified_title` — pin title (fallback `grid_title`; `seo_title` is localized nav text and `title` is empty — do NOT use either).
  - `closeup_description` — full description text (`description` field is a `" "` placeholder — unusable).
  - `images.orig.url` — full-resolution original image URL on `i.pinimg.com/originals/...`.
  - `videos.video_list.V_HLSV4.url` — HLS m3u8 URL (present only on video Pins). Reliable video-Pin detector: presence of `videos.video_list.V_HLSV4`. NOTE: `is_video`, `video_status`, `is_playable` are NOT reliable (video Pin had all false/null).
  - `link` — outbound source URL; `domain` — its host.
  - `pinner` — creator object: `{ username, full_name, image_medium_url, follower_count, id }`. It has NO `profile_url`; construct `profileUrl = "https://www.pinterest.com/" + username + "/"`.
  - `reaction_counts` — object keyed by reaction type; the displayed save count is `reaction_counts["1"]` (e.g. 325). `[data-test-id="reactions-count"]` renders the same number.
  - `aggregated_pin_data.comment_count` — comment count (e.g. 10). The rendered `#comments-heading` may be a few higher (11/305 vs 10/301) — a known minor site-side discrepancy; use the aggregated field.
  - `board` — `{ name, url, id }` of the board the pin is saved to.

### Comment section (lazy-loaded; only when include_comments=true)

- Before interaction, SSR renders 1 comment container and the count heading `#comments-heading`.
- Click `[data-test-id="canonical-card-tap-area"]` (a div role=button containing the comment count + first comment) to expand the feed. This fires resource GETs:
  - `UnifiedCommentsResource/get` — main comment feed. Options: `aggregated_pin_id`, `page_size:10`, `bookmarks[]`. Response `resource_response.data[]` entries: `{ id, type, user: {username, full_name, id}, details (text), done_at (createdAt), like_count, comment_count, ... }`; `resource_response.bookmark` is the next-page cursor.
  - `AggregatedCommentReplyFeedResource/get` — per-comment reply feeds. Entries use `text` / `created_at` instead of `details` / `done_at`.
  - `DidItCommentsResource/get` — "Did It" data comments (separate stream; can be ignored).
- Pagination: scroll the comment feed container (find an ancestor div with `scrollHeight > clientHeight`, set `scrollTop = scrollHeight`) to trigger the next `UnifiedCommentsResource` call with the previous bookmark. Verified 38 → 75 rendered comments after one scroll cycle.
- Comment DOM: `[data-test-id="author-and-comment-container"]` — one container per comment. author = the inner `<a href="/<username>/">DisplayName</a>`; text = the second `[data-test-id="text-container"]` inner text. NO visible timestamp element — createdAt must come from the API responses.

### Related Pins ("More like this"; only when related_limit > 0)

- Scroll the window to the bottom (`window.scrollTo(0, document.documentElement.scrollHeight)`) to trigger `RelatedModulesResource/get` (options: `pin_id`, `page_size:12`, `bookmarks[]`).
- Response `resource_response.data[]` is an array of full pin objects: `{ id, title, grid_title, images.orig.url, domain, grid_attribution: {username, full_name} }`. Some related pins have empty `title` → fall back to `grid_title`.
- Pagination: `resource_response.bookmark` → next request uses `bookmarks:[bookmark]`. ~11-12 pins per page.

### Error / NOT_FOUND

- Non-existent pin id redirects to `https://www.pinterest.com/?show_error=true` (homepage with error flag). Detection: after `goto`, `location.href` no longer matches `/pin/<id>/`, OR the id is absent from `initialReduxState.pins`.

## Failure Signals

- Rate-aware pacing / throttle: Pinterest may rate-limit or show verification when scrolling many detail pages in a short window. Mitigate with random short waits (200–500ms) between scroll/load steps, randomized scrolling and mouse movement, low request frequency. Lengthen intervals adaptively when responses slow or return throttling signals.
- `BROWSER_ATTACH_REQUIRED`: browser runtime requires the user's Chrome with remote debugging enabled and Pinterest logged in. First daemon connect may show Chrome's "Allow remote debugging" consent prompt.
- NOT_FOUND: as above, redirect to `/?show_error=true` or id missing from SSR pins.
- DRIFT: field mapping above may shift if Pinterest changes the SSR shape; the `__PWS_INITIAL_PROPS__` script tag and `initialReduxState.pins` structure are the anchor.

## Capture Assessment

The path is verified end-to-end on real data: SSR extraction for the core pin fields (image + video), lazy comment feed with bookmark pagination, related-pins via scroll, and the NOT_FOUND error case. It is parameterizable (`url`, `include_comments`, `comment_limit`, `related_limit`) and highly reusable (single Pin detail is the core entity across the Pinterest command family). Capture as `pinterest/get-pin`, runtime `browser` (requires logged-in session).
