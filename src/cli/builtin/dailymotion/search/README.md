# dailymotion/search

Search Dailymotion by keyword, matching the behavior of the on-site search box. Covers the six search tabs: 热门结果(top) / 视频(video) / 播放列表(playlist) / 频道(user=uploaders) / 直播(live) / 标签(hashtag). Runs in the browser session, reads the site's own `SEARCH_QUERY` GraphQL API, and falls back to the visible DOM when the API drifts.

## Description

The command navigates to `dailymotion.com/search/{query}/{tab}`, then issues the same `SEARCH_QUERY` request the site uses, from the page context (reading `access_token` + `dmaid` cookies so the API authenticates). Pagination changes only the `page` variable. sort/time map to the site's real filter controls (`sortByVideos` / `createdAfterVideos`).

## Parameters

- `query` (required): search keywords.
- `type` (default `video`): `video`(视频) | `top`(热门结果) | `user`(频道=上传者, /user/ links — NOT the 17 fixed topic channels of get-channel-videos) | `playlist`(播放列表) | `live`(直播) | `hashtag`(标签).
- `limit` (default `20`, max `100`): result cap; paginates internally.
- `sort` (default `relevance`): `relevance` | `recent`(最新) | `viewed`(观看最多). video/top only.
- `time` (default `all`): `all` | `day`(今天) | `week`(本周) | `month`(本月) | `year`(今年). video/top only.

## Return Value

Returns `query`, `type`, `limit`, `maxLimit`, `count`, `results`, `source`, and optionally `partial` / `ignoredParams`. `results` is a flat array of normalized records keyed by `kind` (video / top / user / playlist / live / hashtag). Each record carries xid, title/name, URL, and type-specific fields (duration, thumbnail, creator/owner, createdAt, followers, videosTotal, isOnAir, etc.). `source: "api"` means data came from the GraphQL API; `source: "dom"` means the DOM fallback ran (`fallbackUsed: true`, `partial: true`).

## Usage

```
websculpt dailymotion search --query "artificial intelligence" --type video --limit 20
websculpt dailymotion search --query "cat" --type user --limit 10
websculpt dailymotion search --query "sports" --type video --sort viewed --time month
```

## Common Error Codes

- `MISSING_PARAM`: query is blank or omitted.
- `INVALID_PARAM`: invalid type, sort, time, or non-numeric limit.
- `LIMIT_EXCEEDED`: limit is greater than 100.
- `DRIFT_DETECTED`: both the API path and the visible DOM extraction failed.
