# Evidence: twitch/get-channel-clips

This document records the research and validation evidence for the `twitch/get-channel-clips` command.

## Exploration Path

The Twitch clips list path was validated during the explore phase (`explore assess` returned `status: passed` on 2026-08-17; contract confirmed). Browser automation was performed with `@playwright/cli` attached to the user's Chrome via CDP. Library check: `websculpt command list twitch` shows only `twitch/search` (browser, no login); no name conflict with the planned `twitch/get-channel-clips`.

The command-family plan contract was treated as a hypothesis and verified against the live site; deviations are documented in the explore trace (range value `24hr` in the URL vs `24h` in the enum, range label "热门 所有" for `all`, single-request pagination strategy).

## Verified URLs

- https://www.twitch.tv/xqc/clips (default range 7d; card structure, range enum, default-window behavior)
- https://www.twitch.tv/xqc/clips?range=24hr
- https://www.twitch.tv/xqc/clips?range=all
- https://www.twitch.tv/shroud/clips (offline channel ~23 days; auto-widened to 30d)
- https://www.twitch.tv/shroud/clips?range=30d
- https://www.twitch.tv/playvalorant/clips (channel with no clips → auto range=all, empty grid)
- https://gql.twitch.tv/gql (ClipsCards__User GraphQL operation; CORS `Access-Control-Allow-Origin: *`)
- https://gql.twitch.tv/integrity (integrity token endpoint; token alone does not unlock cursor pagination)

## Structural Evidence

The clips list is served by the internal GraphQL endpoint `https://gql.twitch.tv/gql` (POST), public web Client-Id `kimne78kx3ncx6brgo4mv6wki5h1ko`, no auth. CORS preflight returns `Access-Control-Allow-Origin: *` and allows `Client-Id`/`Content-Type`, so the request works from an arbitrary page context (matches the existing `twitch/search` command, which does not navigate first).

Operation (persisted query):
- operationName: `ClipsCards__User`
- sha256Hash: `1cd671bfa12cec480499c087319f26d21925e9695d1f80225aae6a4354f23088`
- variables: `{ login, limit, criteria: { filter, shouldFilterByDiscoverySetting: true }, cursor: null }`

Range mapping (verified by clicking the on-page dropdown `[data-a-target="time-filter-selection"]` and options `[data-a-target^="time-filter-option"]`):

| user value | URL ?range= | dropdown label (zh) | GraphQL filter |
|---|---|---|---|
| 24h | 24hr | 热门 24 小时 | LAST_DAY |
| 7d | 7d | 热门 7 天 | LAST_WEEK |
| 30d | 30d | 热门 30 天 | LAST_MONTH |
| all | all | 热门 所有 | ALL_TIME |

Response edge node fields: `id`, `slug`, `url` (https://www.twitch.tv/{channel}/clip/{slug}), `title`, `viewCount`, `language`, `curator {login, displayName}` (clipper), `game`, `broadcaster`, `thumbnailURL`, `createdAt` (ISO 8601), `durationSeconds`, `isFeatured`, `isAutoCurated`. Sample edge (xqc LAST_WEEK):

```json
{
  "slug": "SmokyFragileFoxRedCoat-MRH2eCK-8aE8xUzd",
  "url": "https://www.twitch.tv/xqc/clip/SmokyFragileFoxRedCoat-MRH2eCK-8aE8xUzd",
  "title": "Fellaaaaaaaa",
  "viewCount": 26831,
  "curator": { "login": "puertoricanporo", "displayName": "puertoricanporo" },
  "thumbnailURL": "https://static-cdn.jtvnw.net/twitch-video-assets/...",
  "createdAt": "2026-08-14T01:55:28Z",
  "durationSeconds": 29
}
```

`limit` accepts 1-100 per request (limit=200 returns error `argument 'first' value must be between 1 and 100`). A single request returns up to `limit` edges (xqc ALL_TIME limit=100 → 100 edges); some filters return fewer on the first page with `hasNextPage: true` (xqc LAST_WEEK limit=100 → 75 edges). Cursor pagination (using the last edge's `cursor`) is blocked by Twitch's integrity check (`IntegrityCheckFailed`) both from node fetch and from a plain in-page fetch; only the page's own GraphQL client (valid integrity session) can paginate. The contract therefore uses a single request with no cursor pagination; `partial: true` is returned when the server returns fewer than `limit`.

DOM card structure (fallback reference): card container `article`; title `article h4[title]`; link `article a[href*="/clip/"]`; thumbnail + duration/views/relative-time overlay `a[data-a-target="preview-card-image-link"]`; channel link `a[data-a-target="preview-card-channel-link"]`; clipper text `由 {clipper} 剪辑`. The DOM only shows relative time (e.g. "3天前"), not absolute `createdAt` — the GraphQL response is the source for `createdAt`.

## Failure Signals

- Channel not found: GraphQL returns `data.user: null`.
- Channel with no clips: `data.user.clips.edges: []` (valid empty result; return an empty list, not an error).
- `limit` out of range: GraphQL returns error `argument 'first' value must be between 1 and 100`.
- Cursor pagination: `IntegrityCheckFailed` (intentionally not used).
- Page auto-widens range: visiting `/{channel}/clips` with no query auto-selects a window by clip availability (xqc→7d, shroud offline→30d, playvalorant→all). The command must always set the GraphQL `filter` explicitly.
- Structural drift: HTTP != 200, unparseable body, missing `data.user.clips`, unknown persisted query (`PersistedQueryNotFound`), or unexpected response shape → `DRIFT_DETECTED`.

## Capture Assessment

The path is verified, stable, reusable, and parameterizable (channel + range + limit). It answers a recurring need ("what are this channel's top clips over a time window") not covered by the existing `twitch/search`. Runtime `browser` is used per the confirmed contract: node first-page fetch works but cursor pagination is integrity-gated, and the twitch command family is browser-based. Capture as `twitch/get-channel-clips`.
