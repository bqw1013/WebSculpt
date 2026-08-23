# Context

## Precipitation Background (Why This Command Exists)

Dailymotion had no feed command. The homepage Discover (发现) feed is a personalized, region-localized video stream that exists only in the logged-in browser — there is no public API equivalent (the internal GraphQL endpoint returns 401 anonymously). A prior command-family plan was the starting point; explore phase verified the real structure and corrected the plan's card-count assumption (~80 anchors ≠ 40 cards).

## Value Assessment

The Discover feed is the personalized landing surface a user sees on every visit. It is re-usable for "what does my Dailymotion homepage show right now", content curation, and feeding the video ID into `dailymotion/get-video`. Reuse frequency: on-demand; it saves re-navigating and re-probing the feed by hand.

## Page Structure

- Homepage `https://www.dailymotion.com/` redirects to the region locale (a logged-in session → `/ca`, Chinese UI).
- Feed container: `ul[class*="PageLayout__masonry"] > li`; card wrapper `div[class*="HomeVideoFeed__homeFeedItem"]`.
- DOM card fields: title `a[class*="videoTitle"] h2[title]`, video link `a[href="/video/{id}"]`, thumbnail `img[data-testid="img-loader"]`, uploader `[class*="videoChannelName"]` + link `a[class*="channelLogoLink"]`, verified badge (`accountType = verified-partner`).
- Feed is a **fixed batch of 40 cards**; scrolling does not load more; no pagination.
- Primary data source (validated in explore): page-internal GraphQL `POST https://api.dailymotion.com/v1/graphql`, `authorization: Bearer <access_token cookie>`, operation `SEARCH_DISCOVERY_QUERY`:
  `featuredVideos: conversations(filter: {story: {in: [VIDEO]}, algorithm: {eq: PERSONALIZED}}, first: N)` + `SEARCH_DISCOVERY_VIDEO_FRAGMENT` on Video (`id, xid, title, isPublished, embedURL, thumbnailx240, createdAt, channel{name, displayName, accountType}, duration, aspectRatio`).

## Environment Dependencies

- Login required: the feed is personalized (`algorithm: PERSONALIZED`) and the GraphQL endpoint returns 401 without the user's `access_token`. The command runs inside the logged-in browser session.
- Browser runtime: daemon attaches to the user's Chrome/Edge; the injected page shares cookies/localStorage. First attach may show a Chrome "allow remote debugging" prompt that needs a human click — retry if `BROWSER_ATTACH_REQUIRED` appears before blaming command logic.
- Region determines content and UI language (`/ca`, `lang=zh_CN` in the logged-in session). Output does not depend on locale.
- Polite pacing: light mouse nudge + jitter sleeps; the site showed no rate-limit signal across multiple GraphQL calls.

## Failure Signals

- `access_token` cookie missing or GraphQL 401 → `AUTH_REQUIRED` (login-dependent surface).
- GraphQL response missing `data.featuredVideos.edges` → fall back to DOM; if DOM also empty → `DRIFT_DETECTED`.
- GraphQL validation errors if the query is trimmed ("Unused Variable", "Field xid doesn't exist on Story") — keep the full fragment and only declare used variables.
- Background tab throttling can stall lazy rendering — the command calls `page.bringToFront()` after navigation.

## Repair Clues

- If the GraphQL schema drifts, re-derive `SEARCH_DISCOVERY_QUERY` from a fresh homepage network capture (`api.dailymotion.com/v1/graphql` requests) and update `buildFeedQuery`.
- DOM fallback selectors: `ul[class*="PageLayout__masonry"] > li`, `a[class*="videoTitle"]`, `[class*="videoChannelName"]`, `img[data-testid="img-loader"]`. If the masonry class hash changes, the `[class*=...]` contains-match keeps working.
- If the feed stops being a fixed 40 (e.g. infinite scroll added), re-check the GraphQL `pageInfo` for cursor pagination and add a pagination loop.
