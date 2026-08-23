# Context

## Precipitation Background

Instagram was a pending browser target. The home feed (`instagram.com/`) mixes posts from accounts the viewer follows, algorithmically suggested posts, and ads. The feed stream is unbounded: `page_info.has_next_page` stayed `true` across 11 pagination responses and 20 scrolls, no `end_of_feed_demarcator` was observed, and the DOM never showed "已全部看完" — so exhaustion is detected by stall, not by cursor.

## Value Assessment

The home feed is the primary "what did the accounts I follow post" entry point. The first-party Relay query and cursor pagination are reusable for repeated feed reads without scraping detail pages.

## Page Structure

- Home URL: `https://www.instagram.com/`
- First page feed data is embedded in the SSR HTML in a `<script type="application/json">` containing the key `xdt_api__v1__feed__timeline__connection` (relay preloader `PolarisFeedTimelineRootV2QueryRelayPreloader`); a fresh navigation does not always fire the feed XHR.
- Pagination: the app POSTs to `/graphql/query` with `x-fb-friendly-name = PolarisFeedRootPaginationCachedQuery_subscribe` and doc_id `27904127075908540`; variables include `after` cursor, `first: 12`, `variant: "home"`.
- Response path: `data.xdt_api__v1__feed__timeline__connection = { pagination_source, edges[], page_info { end_cursor, has_next_page } }`.
- Edge node `XDTFeedItem` is a union: `media` (following post), `explore_story` (suggested, wraps the media), `ad` (sponsored; media in `ad.items[0]`). Source is decided from the union member plus `media.user.friendship_status.following`.

## Environment Dependencies

Browser runtime uses an existing logged-in Instagram session. The command navigates to home, reads the SSR-embedded first page, then scrolls to trigger the app's natural pagination XHRs and collects the feed responses from `page.on("response")`. Requests are paced with 1.5-3s randomized waits between scrolls.

## Failure Signals

A missing feed envelope, a non-OK response, or an empty feed after navigation plus scrolls leads to `DRIFT_DETECTED`. Login walls, CAPTCHA, 403, and 429 are not bypassed. Replay note: `/api/graphql` with only basic headers returns `connection: null`; the feed query must go through `/graphql/query` with full headers (`x-csrftoken`, `x-fb-lsd`, `x-root-field-name`, `x-ig-app-id`, etc.) if the app's own requests are not used.

## Repair Clues

Re-explore the current feed friendly name, doc_id, and response path if Instagram changes its Relay schema. The SSR preloader script may change; the recursive walk for `xdt_api__v1__feed__timeline__connection` should be updated. If scrolling stops triggering feed XHRs, a fallback is to replay `/graphql/query` with the captured request body plus full headers, updating `variables.after`.
