# Evidence: pinterest/get-user

This document records the research and validation evidence for the `pinterest/get-user` command.

## Exploration Path

- Browser automation guide read before explore (explore phase, `@playwright/cli`). Browser exploration recorded; `websculpt explore assess pinterest-get-user` returned `status: passed`, candidate `pinterest/get-user`.
- Library check: `websculpt command list pinterest` shows only `pinterest/search`. No existing get-user command; this is a new command in the pinterest family.
- Target sample user: `joyfilledeats` (public profile).
- Key discovery: the page's own XHR calls to `/resource/<Name>Resource/get/` endpoints carry internal auth. A raw in-page `fetch` to the same endpoint returns `Invalid Resource Request`. Therefore the command must drive the real page (goto + waitForResponse) rather than call the resource endpoints directly with bare fetch.

## Verified URLs

- verified-urls:
  - `https://www.pinterest.com/joyfilledeats/` — user profile, saved tab (boards grid). SSR profile + `UserResource` + `BoardsResource`.
  - `https://www.pinterest.com/joyfilledeats/_created/` — created tab (original pins). `UserActivityPinsResource`.
  - `https://www.pinterest.com/resource/UserResource/get/?source_url=%2Fjoyfilledeats%2F&data={"options":{"username":"joyfilledeats","field_set_key":"profile"},"context":{}}` — profile API (200, JSON).
  - `https://www.pinterest.com/resource/BoardsResource/get/?source_url=%2Fjoyfilledeats%2F&data={"options":{"privacy_filter":"all","sort":"last_pinned_to","field_set_key":"profile_grid_item","filter_stories":false,"username":"joyfilledeats","page_size":25,"group_by":"visibility","include_archived":true,"filter_all_pins":false,"add_fields":"board.{meal_plan}"},"context":{}}` — saved boards API (200, JSON), paginated by `bookmarks`.
  - `https://www.pinterest.com/resource/UserActivityPinsResource/get/?source_url=%2Fjoyfilledeats%2F_created%2F&data={"options":{"exclude_add_pin_rep":true,"field_set_key":"profile_created_grid_item","is_own_profile_pins":false,"user_id":"109282865866396672","username":"joyfilledeats","data":{"page_size":50},"noCache":true},"context":{}}` — created pins API (200, JSON), paginated by `bookmarks`.
  - `https://www.pinterest.com/thisuserdoesnotexist12345xyz/` — NOT_FOUND scenario (redirects to `https://www.pinterest.com/?show_error=true`).

## Structural Evidence

### Profile (UserResource, field_set_key=profile) — `resource_response.data`
- Fields: `username`, `full_name`, `about` (bio), `follower_count` (315544), `following_count` (180), `profile_views` (1432940; the page shows this as "143.3 万 月浏览量" — monthly views), `website_url` (`http://www.joyfilledeats.com`), `image_xlarge_url` (avatar 280x280 pinimg URL), `board_count`, `pin_count`, `eligible_profile_tabs` (`tab_type:0` 已收藏/saved default; `tab_type:1` 已创建/created).
- IMPORTANT: the monthly-views field is `profile_views`, not `monthly_views`.

### Profile DOM selectors (data-test-id, hyphenated) — SSR fallback / confirmation
- `[data-test-id=profile-name]` → display name text.
- `[data-test-id=profile-username]` → username text.
- `[data-test-id=profile-followers-count]` → e.g. "31.6 万 位粉丝".
- `[data-test-id=profile-following-count]` → e.g. "173 位关注中".
- `[data-test-id=main-user-description-text]` → bio text.
- `[data-test-id=gestalt-avatar-svg] img` → avatar src.
- `[data-test-id=profile-header] a[href^=http]` → external links (e.g. website + Instagram).
- Tabs: `#_saved-profile-tab` (saved, href empty on base URL), `#_created-profile-tab` (`href="/<username>/_created/"`), both `<a role=tab>`.
- Board cards: `[data-test-id=profile-board-card]`, `[data-test-id=board-card-title]`, `[data-test-id=cover-image]`. Cards have no direct `<a>` link; board URL comes from the API `url` field.
- Pin cards: `[data-test-id=pin]` with `data-test-pin-id`, inner `a[href*=/pin/]` (pinUrl), `img` currentSrc (236x), `aria-label`/`alt` (title).

### Boards (BoardsResource) — `resource_response.data` array
- First page: `type=story` item is the "所有 Pin" (All Pins) card; remaining items are `type=board`. Later pages: only `type=board`.
- Board fields: `id`, `name`, `url` (path like `/joyfilledeats/coffee-drinks-desserts-more/`), `pin_count`, `board_order_modified_at` (last-updated ISO string), `privacy`, `image_cover_url`, `owner` (nested user object with `username`), `is_collaborative` (boolean).
- Pagination: `resource_response.bookmark` (cursor). Next page: append `"bookmarks":[<prev>]` to options. `page_size: 25`.
- COLLABORATIVE BOARDS: later pages are mostly `is_collaborative: true` boards owned by OTHER users (e.g. `/wholesomeyum/low-carb-holiday-recipes/`). The saved grid = own boards (front) + group boards the user contributes to (back). Each board's `url` keeps the real owner path. `owner` and `is_collaborative` are exposed so callers can distinguish.

### Created pins (UserActivityPinsResource) — `resource_response.data` array
- Pin fields: `id`, `title`, `grid_title`, `description`, `images` (dict with `orig`, `736x`, `236x`, etc.; use `orig` for original), `is_video`, `videos.video_list.HLS_*` (video pins), `link` (source URL), `domain`, `pinner.username`, `board` `{id, name}`, `created_at`, `is_repin`.
- All returned pins have `pinner.username === <username>` (the user's own creations).
- Pagination: `resource_response.bookmark` cursor. `data.page_size: 50` per page.
- pinUrl is built as `https://www.pinterest.com/pin/<id>/`.

### Tab switching
- saved = `/<username>/` (default), created = `/<username>/_created/`. Independent URLs; clicking the created tab performs a full navigation (`performance.navigation.type` = navigate). Command navigates directly to the target URL.

## Failure Signals

- NOT_FOUND: navigating to a non-existent username redirects to `https://www.pinterest.com/?show_error=true`; `[data-test-id=profile-name]` is absent. Detect via final URL containing `show_error=true` or missing `profile-name`.
- Raw in-page `fetch` to `/resource/...` returns `Invalid Resource Request` (internal auth required). Must use the page's own XHR via `page.waitForResponse`.
- Polite pacing: Pinterest fires many resource requests per navigation; keep low frequency, random scroll offsets, and short randomized waits (~200-500ms between scrolls), lengthening adaptively if throttling/rate-limiting signals appear.
- Profile DOM counts (e.g. followers/following) are localized/rounded ("31.6 万"); use the API numeric fields for precision. `following_count` may differ slightly from the SSR first-paint text (180 vs 173).
- Video pins: `images.orig` is the cover; the actual video requires `get-pin`/`download`.
- Private / restricted profiles may render without full data (not verified; treat missing profile-name as a signal).

## Capture Assessment

This command should be captured. The profile + dual-tab path is fully verified with real data in the explore trace, the resource endpoints and their bookmark pagination are stable, and the command fills a clear gap in the pinterest family (user profiles, chaining from `pinterest/search --type user` / `get-pin` creator fields to `get-user`, and on to `get-board`). Capture as `pinterest/get-user`, browser runtime, with `username` (required), `tab` (saved|created, default saved), `limit` (1-100, default 20). Output: profile metadata always, plus `boards` (saved) or `pins` (created); boards include `owner` and `isCollaborative`.
