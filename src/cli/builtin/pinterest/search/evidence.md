# Evidence: pinterest/search

This document records the research and validation evidence for the `pinterest/search` command.

## Exploration Path

- Command library check: `websculpt command list pinterest` returned only `pinterest/search` (user source, browser runtime) — the command being reworked in place (limit 20→100, type expanded to pin|board|user, sort/time removed, related_queries added).
- Read the browser runtime contract and the explore access guide before browser work.
- A prior explore workspace passed `websculpt explore assess` (status passed, capture eligible: yes) on 2026-08-19 after the user confirmed the contract.
- Browser verification used `@playwright/cli` attaching the user's already-running Chrome via CDP. No new browser was launched.

## Verified URLs

- `https://www.pinterest.com/` (logged-in home feed)
- `https://www.pinterest.com/search/pins/?q=keto%20recipes` (pin search: cards, related_queries chips, BaseSearchResource API, scroll pagination, limit=100 reached)
- `https://www.pinterest.com/search/pins/?q=coffee` (re-verified related_queries selector on a second query)
- `https://www.pinterest.com/search/boards/?q=keto%20recipes` (board search: `board-card` DOM, BaseSearchResource scope=boards API)
- `https://www.pinterest.com/search/users/?q=keto%20recipes` (user search: `user-rep-with-card` DOM, SSR + scroll loading)
- Data endpoints: `POST https://www.pinterest.com/resource/BaseSearchResource/get/` (pins/boards, bookmark pagination); `ApiResource/get` (`/v3/filters/`, user filter metadata — not a user-results source)

## Structural Evidence

- Pin search cards: `[data-test-id=pin]` with `data-test-pin-id`; card DOM contains the main link `a[href="/pin/<id>/"]` with `aria-label="<title> Pin 图页面"` and an `img` whose `srcset` includes `https://i.pinimg.com/originals/...` (full-resolution 4x). No creator/description/source in the card DOM.
- Related queries: buttons `[data-test-id=one-bar-pill]` inside `[data-test-id=one-bar-module-3]`; clean selector `[data-test-id=one-bar-module-3] [data-test-id=one-bar-pill]`. Verified 25 chips for "keto recipes" (Dinner, Easy, Beginners, Healthy, Clean, Ground beef, Low carb, Chicken, Crockpot, Vegetarian, Best, Breakfast, Vegan, Dairy free, Simple, Cottage cheese, Dessert, Shrimp, Gluten free, Air fryer, Ground chicken, Slow cooker, Ground turkey, Zucchini, Mediterranean) and 25 for "coffee". Present only on pin search (board/user search pages have no such module).
- Filter UI: `[data-test-id=search-filter]` scope dropdown expands to exactly two items — `[data-test-id=search-filter-all-pins]` "所有 Pin 图" and `[data-test-id=search-filter-your-pins]` "你的 Pin 图". A separate content-type filter panel offers 所有 Pin 图/视频/图板/个人资料/产品 + "减少 AI 内容" + 重置/应用. No sort or time keywords anywhere on the page.
- Core API: `POST /resource/BaseSearchResource/get/` (xhr, `content-type: application/x-www-form-urlencoded`, `x-csrftoken` header). Response `resource_response.data.results[]` holds rich pin objects: `id`, `node_id`, `type:"pin"`, `title`, `grid_title`, `description`, `pinner` (`id`/`username`/`full_name`/`follower_count`/`image_small_url`/`image_medium_url`/`image_large_url`/`is_verified_merchant`), `images` (`170x`/`236x`/`474x`/`736x`/`orig`), `board` (`id`/`name`/`pin_thumbnail_urls`), `domain` (external site name; "Uploaded by user" when none), `link` (external source URL), `reaction_counts` (`{"1":N}`), `is_video`, `story_pin_data`, `alt_text`, `created_at`, `dominant_color`. `resource_response.bookmark` is a base64 cursor (25 results/page, pages do not repeat). `data.oneBarModules` holds only the content-type filter and the GENAI filter — not related queries.
- Board search: `[data-test-id=board-card]` with `a[href="/<user>/<board-slug>/"]`; card text `<boardName>\n<ownerDisplayName>\n<N> 张 Pin 图\n·\n<updated>`. API `BaseSearchResource/get/` with `options.scope:"boards"` returns `type:"board"` objects: `id`, `name`, `owner` (`id`/`username`/`full_name`/`follower_count`/image urls), `url` (`/mommafitlyndsey/keto-recipes/`), `pin_count`, `section_count`, `description`, `image_cover_url`, `image_cover_hd_url`, `cover_images`, `privacy`, `board_order_modified_at`, `collaborator_count`, `is_collaborative`. ~50 results per page.
- User search: `[data-test-id=user-rep-with-card]` → `[data-test-id=user-rep]` (`role=group`, `aria-label="用户"`) → `a[href="/<username>/"]` (`aria-label="个人资料 <displayName>"`); card text `<displayName>\n<followerCount> 位粉丝\n关注`; avatar `img`. 50 cards SSR'd on load; scrolling loads more (observed 50→100→150). No pagination API request was identifiable (data appears pre-rendered/SSR and revealed on scroll), so DOM accumulation is the reliable path. User `id` is not exposed in the card DOM.
- Scroll/pagination: pin and board paginate via `BaseSearchResource` bookmark (25/page pins, ~50/page boards). Pin DOM is virtualized — `[data-test-id=pin]` node count fluctuates during scroll (18/27/20/23/...), so progress must be measured by accumulated unique `data-test-pin-id`, not node count. Accumulated 101 unique pin ids for "keto recipes" (limit 100 reachable). Exhaustion detection: 3 consecutive scroll steps with no new items.

## Failure Signals

- `MISSING_PARAM`: blank query. `INVALID_PARAM`: limit is not a positive integer. `LIMIT_EXCEEDED`: limit > 100. `INVALID_TYPE`: type not pin|board|user.
- `DRIFT_DETECTED`: the expected result selector is absent without an explicit empty-result message.
- Empty results: page body contains a no-results message (no results / 未找到 / 没有结果 / nothing found) → return empty `items` with `partial: true` instead of throwing.
- External-source absence: pin `domain` is "Uploaded by user" → `sourceLink` is null (no outbound source).
- Bot challenge/CAPTCHA/403/429: surface rather than bypass; no such signals observed during exploration (12+ scroll steps with 900-1400ms sleeps). Command keeps randomized short scroll waits (200-500ms) and adaptively lengthens the wait on no-growth/throttle suspicion.
- API response parsing errors are swallowed; the DOM card fallback produces minimal pin/board items (id/title/imageUrl/url) with rich fields null when the API is unavailable.

## Capture Assessment

Capture is justified: the rework of `pinterest/search` is fully verified end-to-end on a real logged-in session. All four changes are grounded in evidence — limit 1-100 via `BaseSearchResource` bookmark pagination (101 unique pins accumulated), type pin|board|user with three distinct working URLs and card/API structures, confirmation that no sort/time UI exists (only the 所有 Pin 图/你的 Pin 图 scope dropdown), and a stable related_queries selector. The implementation uses the verified `BaseSearchResource` API for rich pin/board fields, DOM accumulation for user search, and a DOM fallback for API failure. It is fully parameterized (query/type/limit) and replaces the existing command per the confirmed contract.
