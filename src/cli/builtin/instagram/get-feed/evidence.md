# Evidence: instagram/get-feed

This document records the research and validation evidence for the `instagram/get-feed` command.

## Exploration Path

Command library check: `websculpt command list instagram` returned a single existing command `instagram/search` (browser runtime, logged-in session). No feed command exists, so `instagram/get-feed` is a new, complementary command. Explored with Playwright CLI session `<session>` attached to the user's logged-in Chrome (own tab, closed and detached afterwards). Verified the source-distinction and cursor-pagination facts below with in-page fetch replays, XHR hooks, and the embedded SSR payload.

## Verified URLs

* `https://www.instagram.com/`
* `POST https://www.instagram.com/graphql/query` (app scroll pagination; in-page fetch replay returns 200 with the same envelope)

## Structural Evidence

Home feed pagination is served by a first-party Relay GraphQL POST to `/graphql/query` with `x-fb-friendly-name = PolarisFeedRootPaginationCachedQuery_subscribe` and doc_id `27904127075908540`. Variables contain `after` (opaque cursor), `before: null`, `data: { device_id, pagination_source: "feed_recs", feed_view_info: [...] }`, `first: 12`, `last: null`, `variant: "home"`, plus `__relay_internal__pv__*` flags.

Response path: `data.xdt_api__v1__feed__timeline__connection = { pagination_source, edges[], page_info { end_cursor, has_next_page } }`. Cursor pagination verified: the next request's `variables.after` equals the previous response's `page_info.end_cursor`.

Each `edges[].node` is an `XDTFeedItem` union container with exactly one non-null content field:
- `ad` non-null → source `ad`; the ad media is a full media object in `node.ad.items[0]` (sample: `ad_id=<ad-id>`, `label="赞助内容"`, `items[0]={pk, code:"<shortcode>", user.username:"<advertiser>", media_type:1, like_count, comment_count, taken_at}`).
- `explore_story` non-null → source `suggested`; media in `node.explore_story.media` with `user.friendship_status.following === false` (sample: code `<shortcode>`, user `<suggested-user>`, media_type 2, like_count, comment_count, taken_at, caption text, `image_versions2.candidates[]` and `video_versions[]` URLs). DOM cross-check: these posts show a "关注" (follow) button, i.e. the viewer does not follow the author.
- `media` non-null alone → source `following`, determined by `media.user.friendship_status.following === true` (logical complement; the suggested branch was directly observed with 30+ samples).
- Other union members (`end_of_feed_demarcator`, `stories_netego`, `suggested_users`, etc.) carry no post media and are skipped.

Media node fields: `code`, `pk`, `user{ username, friendship_status.following }`, `media_type` (1 image, 2 video, 8 carousel), `like_count`, `comment_count`, `taken_at`, `caption` (string or `{text}`), `image_versions2.candidates[]` (url/w/h), `video_versions[].url`, `carousel_media[]`.

First page: the initial feed is embedded in the SSR HTML in a `<script type="application/json">` containing the key `xdt_api__v1__feed__timeline__connection` (relay preloader `PolarisFeedTimelineRootV2QueryRelayPreloader`); a fresh navigation does not always fire the feed XHR, so the first page is read from this embedded payload and pagination continues from scroll-triggered `/graphql/query` responses.

Replay note: in-page `fetch('/graphql/query')` with the captured body and full headers (`x-csrftoken` from cookie, `x-fb-lsd`, `x-ig-app-id: 936619743392459`, `x-ig-max-touch-points: 0`, `x-root-field-name: xdt_api__v1__feed__timeline__connection`, `x-bloks-version-id`, `x-asbd-id: 359341`, `x-fb-friendly-name`) returns 200 with 15 edges and a new cursor. `/api/graphql` with only basic headers returns `connection: null`.

## Failure Signals

The feed requires a logged-in Instagram session; without it the page renders a login wall and `main article` never appears. The feed is unbounded: `page_info.has_next_page` stayed `true` across 11 pagination responses and 20 scrolls, no `end_of_feed_demarcator` was observed, and the DOM never showed "已全部看完" — so exhaustion is signaled by stall (repeated scrolls yielding no new records), not by cursor. A missing feed envelope, a non-OK response, or an empty feed after navigation plus scrolls triggers `DRIFT_DETECTED`. CAPTCHA, 403, 429, and login automation are not bypassed; no such challenge occurred during low-frequency exploration (1.5-3s random pacing).

## Capture Assessment

`instagram/get-feed` is eligible for capture. It reads the user's home feed via the verified first-party Relay query, labels each item's source (`following` / `suggested` / `ad`) from the `XDTFeedItem` union and `friendship_status.following`, maps `media_type` to image/video/carousel, follows cursor pagination until `limit` or stall, and stays within feed-only scope (no detail-page fan-out or account operations).
