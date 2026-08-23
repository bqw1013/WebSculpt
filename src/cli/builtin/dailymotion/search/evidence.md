# Evidence: dailymotion/search

This document records the research and validation evidence for the `dailymotion/search` command.

## Exploration Path

- The Playwright CLI guide and WebSculpt runtime contracts were consulted.
- Explore workspace passed audit (`explore assess` passed, Confirmation recorded).
- Command library check: `websculpt command list dailymotion` returned the existing user `dailymotion/search`; smoke test proved its API path is stale (`page.waitForResponse` 30s timeout, `source:"dom"`, `createdAt` mis-extracted as the title). This capture replaces it.
- `websculpt capture new dailymotion-search --domain dailymotion --action search --runtime browser --force` (name conflict with existing user command, overwrite approved by user).

## Verified URLs

- `https://www.dailymotion.com/search/cat/videos` (video tab; 20 cards; SEARCH_QUERY fired)
- `https://www.dailymotion.com/search/cat/top-results` (top tab; `stories` section)
- `https://www.dailymotion.com/search/cat/playlists` (playlist tab; `video-card` + `/playlist/` links)
- `https://www.dailymotion.com/search/cat/channels` (channel tab; `channel-card` + `/user/` links = uploaders)
- `https://www.dailymotion.com/search/cat/lives` (lives tab; empty for "cat")
- `https://www.dailymotion.com/search/cat/hashtags` (hashtag tab; `hashtag-card` lazy-rendered)
- `https://www.dailymotion.com/search/cat/videos?dateRange=past_month&sortBy=most_recent` (filter URL form)
- `https://search.dailymotion.com/v1` (SEARCH_QUERY GraphQL endpoint the browser actually calls)
- `https://search.dailymotion.com/` (old root endpoint — still needs Authorization, NOT used by the current browser)
- `https://oauth2.dailymotion.com/v2/token` (client_credentials token; weak token rejected by search API with 401/403)
- `https://static.neon-ssr.dailymotion.com/neon-user-ssr/static/app.*.js` (URL constants + `SEARCH_API_ENDPOINT` + client credentials)

## Structural Evidence

- Six tab URL paths (from app chunk, current site truth): `/search/{q}/{videos|lives|channels|playlists|hashtags|top-results}`.
- Search API: `POST https://search.dailymotion.com/v1`, operation `SEARCH_QUERY`. Request headers verified: `Authorization: Bearer <access_token cookie>`, `x-dm-visitor-id: <dmaid cookie uppercase>`, `x-dm-appinfo-type: website`, `x-dm-appinfo-id: com.dailymotion.neon`, `x-dm-appinfo-version: <build>`, `x-dm-preferred-country`, `x-dm-neon-ssr: 0`. Missing `x-dm-visitor-id` returns 200 with empty edges (silent empty).
- Variables: `query, page, limit, shouldInclude{TopResults,Videos,Channels,Playlists,Hashtags,Lives}, sortByVideos, durationMinVideos, durationMaxVideos, createdAfterVideos`.
- Response: `data.search.{videos|stories|channels|playlists|hashtags|lives}.{metadata, pageInfo{hasNextPage,nextPage}, edges[].node}`. `playlists` is the alias for `collections(...)`.
- Node shapes (verified samples):
  - Video: `{xid, title, createdAt(ISO), duration, thumbnail.url, creator:{xid,name,displayName,accountType,avatar.url}}`
  - Channel (user): `{xid, name, displayName, accountType, isFollowed, avatar.url, metrics.engagement.followers.edges[0].node.total}`
  - Collection (playlist): `{xid, name, thumbnail.url, creator:{...}, metrics.engagement.videos.edges[0].node.total}`
  - Hashtag: `{xid, name:"#cat", metrics.engagement.videos.edges[0].node.total}`
  - Live: `{xid, title, audienceCount, isOnAir, thumbnail.url, creator}`
- Pagination: changing `page` 1→2 returns non-overlapping xids; `pageInfo.hasNextPage/nextPage` drives it. Sort values verified by clicking filters: `sortByVideos:"VIEW_COUNT"` (观看最多), `"RECENT"` (最新); `createdAfterVideos:"2026-07-17T16:00:00.000Z"` (past_month).
- Rate limit: `x-ratelimit-remaining: 19` observed (~20/bucket); 6 rapid requests 300ms apart all 200, no 429.
- DOM cards: `[data-testid="video-card"]` (video/top/playlist/live), `channel-card` (user), `hashtag-card` (hashtag). Video title link = `a[href^="/video/"]:not([aria-hidden="true"])`; pubDate = `span[title]`; playlist name = `a[href^="/playlist/"]:not([aria-hidden="true"])` (first such link is the count badge); user name = `a[href^="/user/"][title]` (first `/user/` link is empty avatar); hashtag name = `h4`.
- Node runtime direct access rejected: client_credentials token → 401 not_authorized / 403 openresty. Browser context fetch with session cookies → 200. Hence runtime=browser.

## Failure Signals

- API: missing section, GraphQL errors, HTTP != 200, invalid JSON → API path fails → DOM fallback.
- `NO_SESSION_COOKIE` (no access_token/client_token or dmaid cookie) → DOM fallback.
- Valid empty API response (e.g. lives empty for most queries) → return empty results, NOT a fallback trigger.
- DOM: no matching cards for a type → combined with API failure → `DRIFT_DETECTED`.
- No CAPTCHA/403/429 bypass; if rate-limited, the command paces requests (200-700ms) and returns whatever it collected.

## Capture Assessment

Capture eligible: yes (replace the stale installed command). The path is parameterizable, verified against the current site (endpoint `/v1`, in-page fetch with session cookies, six tabs, real sort/time), returns clean structured records, has bounded serial pagination (max 100) with pacing, and a DOM degradation path with corrected selectors.
