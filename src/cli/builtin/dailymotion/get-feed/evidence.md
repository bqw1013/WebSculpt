# Evidence: dailymotion/get-feed

This document records the research and validation evidence for the `dailymotion/get-feed` command.

## Exploration Path

- Explore workspace passed audit (`explore assess` → `status: passed`, candidate `dailymotion/get-feed`, Confirmation recorded 2026-08-18).
- Command library check: only `dailymotion/search` exists for the domain; `get-feed` is a new command (`new`, no conflict).
- Verified with the user's Chrome via `@playwright/cli` CDP attach (session `<session>`): opened `https://www.dailymotion.com/` in a fresh tab, extracted the Discover feed from both the DOM and the page's own GraphQL endpoint.

## Verified URLs

- https://www.dailymotion.com/ — homepage; redirects to the region locale (`/ca` in the logged-in session, Chinese UI).
- https://www.dailymotion.com/ca — the region-directed homepage showing the Discover feed.
- https://api.dailymotion.com/v1/graphql — POST endpoint for the internal `SEARCH_DISCOVERY_QUERY`; requires `authorization: Bearer <access_token>`; anonymous request returns HTTP 401.

## Structural Evidence

- The homepage root IS the Discover (发现) feed. Left nav contains 为你/发现/关注/书签/播放列表/个人资料.
- Initial feed size: exactly **40 unique video cards** (`ul[class*="PageLayout__masonry"] > li` count = 40; `a[href*="/video/"]` anchors = 80 because each card links twice — thumbnail + title; distinct video IDs = 40). The plan's "about 80" was the anchor count, not cards.
- Card container: `ul[class*="PageLayout__masonry"] > li` → `div[class*="HomeVideoFeed__homeFeedItem"]`.
- DOM card fields: title `a[class*="videoTitle"] h2[title]`, video link `a[href="/video/{id}"]`, thumbnail `img[data-testid="img-loader"]`, uploader `[class*="videoChannelName"]`, uploader link `a[class*="channelLogoLink"]`, verified badge when `accountType = verified-partner`. DOM cards show NO duration, publish time, or view count.
- Scroll behavior: scrolling to the bottom (scrollY 2592 / scrollHeight 3447) does NOT load more — the feed is a **fixed 40-card batch, no infinite scroll, no pagination**.
- GraphQL feed query (operationName `SEARCH_DISCOVERY_QUERY`):
  ```
  featuredVideos: conversations(filter: {story: {in: [VIDEO]}, algorithm: {eq: PERSONALIZED}}, first: N)
  ```
  with fragment `SEARCH_DISCOVERY_VIDEO_FRAGMENT` on Video selecting `id, xid, title, isPublished, embedURL, thumbnailx240: thumbnailURL(size:"x240"), createdAt, channel{id,xid,name,displayName,accountType,isFollowed}, duration, aspectRatio`.
- Auth: the page sends `authorization: Bearer <access_token>` where `access_token` is a JWT cookie on `www.dailymotion.com` (readable via `document.cookie`). Anonymous call → **HTTP 401**.
- Limit behavior: `first: 10` → 10 items; `first: 40` → 40 items with `hasNextPage: false`; `first: 100` → still 40 items. Feed caps at **40**.
- DOM card order == GraphQL order (all 40 compared, `sameOrder: true`), so DOM is a valid fallback for the same feed.
- Personalization evidence: `algorithm: {eq: PERSONALIZED}`, region header `x-dm-preferred-country: ca`, `lang=zh_CN` cookie, logged-in user `<user>`.

## Failure Signals

- Anonymous / missing `access_token` → GraphQL 401 → command must raise `AUTH_REQUIRED`.
- GraphQL query is strict: omitting the fragment spread or declaring unused variables yields GraphQL validation errors ("Unused Variable", "Field xid doesn't exist on Story") — the command keeps the full `SEARCH_DISCOVERY_VIDEO_FRAGMENT` and only declares used variables.
- If the GraphQL response shape changes (`data.featuredVideos.edges` missing), fall back to DOM; if DOM also yields nothing, raise `DRIFT_DETECTED`.
- Background tab throttling can stall lazy rendering; `page.bringToFront()` is called after navigation.
- No rate-limit signals observed across multiple GraphQL calls (all 200).

## Capture Assessment

- Capture as `dailymotion/get-feed`, runtime `browser`, `authRequired: required`. The feed is login-gated (anonymous 401), personalized (`algorithm: PERSONALIZED`), region-localized, and has no public API equivalent — exactly the case for a browser command reusing the logged-in session. Rich fields (duration, createdAt, channel verified status) come from the validated page-internal GraphQL query; DOM is the fallback.
