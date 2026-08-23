# Context

## Precipitation Background (Why This Command Exists)

Dailymotion was a blank platform in WebSculpt. Search is the entry point for most content discovery, and the site's search page has six tabs (top/video/playlist/channel/live/hashtag) whose sorting and playlist search the public REST API cannot reproduce. The prior installed `dailymotion/search` used route interception against the stale endpoint `search.dailymotion.com/`; the site migrated to `/v1` and the route wait always timed out (30s) into DOM fallback with mis-extracted fields. This capture rewrites it against the current site.

## Value Assessment

One command covers all six real search tabs, returns clean structured records from the site's own GraphQL API, and wires sort/time to the site's real filters. Reusing the API keeps fields exact (ISO createdAt, duration in seconds, follower/video totals) instead of DOM text (relative dates, duration badges). Pairs with `dailymotion/get-video`, `get-user`, `get-playlist`.

## Page Structure

- Search URLs: `https://www.dailymotion.com/search/{q}/{videos|top-results|channels|playlists|lives|hashtags}`.
- Search API: `POST https://search.dailymotion.com/v1`, operation `SEARCH_QUERY`. Requires `Authorization: Bearer <access_token cookie>`, `x-dm-visitor-id: <dmaid cookie uppercase>`, plus `x-dm-appinfo-type/id/version`, `x-dm-preferred-country`, `x-dm-neon-ssr`. Missing `x-dm-visitor-id` silently returns empty edges.
- Response: `data.search.{videos|stories|channels|playlists|hashtags|lives}.{metadata, pageInfo{hasNextPage,nextPage}, edges[].node}`. `playlists` is the alias for `collections`.
- sort/time variables: `sortByVideos: "RECENT" | "VIEW_COUNT"`, `createdAfterVideos: ISO date`.
- DOM cards: `[data-testid="video-card"]` (video/top/playlist/live), `channel-card` (user), `hashtag-card` (hashtag). Title link = `a[href^="/video/"]:not([aria-hidden="true"])`; pubDate = `span[title]`; playlist/channel/hashtag names read from the non-aria-hidden link / `a[title]` / `h4`.

## Environment Dependencies

Browser runtime via WebSculpt daemon attached to the user's Chrome/Edge (remote debugging on). The page must be on `www.dailymotion.com` so `access_token` and `dmaid` cookies are readable; a logged-in session yields a user token, an anonymous visitor still has a device token — both work. No API key. Search API is rate-limited (~20/bucket per `x-ratelimit-remaining`); the command sleeps 200-700ms between pagination requests. No CAPTCHA/403/429 bypass.

## Failure Signals

- Missing `SEARCH_QUERY` section or GraphQL errors → API path fails, falls back to DOM.
- `NO_SESSION_COOKIE` (no access_token/client_token or dmaid) → falls back to DOM.
- Empty valid response (e.g. lives often empty for a query) is a normal empty result, not a fallback trigger.
- If the API endpoint or schema changes, inspect the page's current SEARCH_QUERY request again. If the DOM cards disappear, `DRIFT_DETECTED` is raised only after both paths fail.

## Repair Clues

- The SEARCH_QUERY GraphQL text is embedded verbatim from the browser's own request; if schema fields change, re-capture it and update the embedded query.
- DOM fallback selectors are type-specific; verify each tab's `data-testid` and link patterns when the UI is redesigned.
- The API still returns empty for `lives`/`hashtags` on many queries — treat valid empty as success.
