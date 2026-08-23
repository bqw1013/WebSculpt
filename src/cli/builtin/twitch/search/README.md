# twitch/search

Search Twitch channels, categories, or videos by keyword through Twitch's internal GraphQL endpoint — the equivalent of the search box at the top of twitch.tv (result views: Channels / Categories / Videos).

## Description

Sends a `SearchResultsPage_SearchResults` persisted query to `https://gql.twitch.tv/gql` with the public web Client-Id. Returns structured result cards for the requested type, paginating internally by 15 results per page (cursor-based) up to the `limit`. Twitch search exposes no sorting or time filtering, so no such parameters exist. No login or browser is required — this runs directly from node.

## Parameters

- `query` (required): Search keyword, e.g. `"lck"` or `"league of legends"`. Plain text, same as the on-site search box.
- `type` (optional, default `channel`): Result type.
  - `channel` = 主播频道/直播 — streamer accounts and live streams.
  - `category` = 游戏/分类 — games/topics; the returned `slug` is usable as `twitch/get-feed`'s `--category`.
  - `video` = 视频 — VODs and uploads.
- `limit` (optional, default `20`): Maximum number of results to return, 1-100. Paginates internally by 15 per page; `partial=true` when fewer results exist than requested.

## Return Value

```json
{
  "query": "lck",
  "type": "channel",
  "limit": 20,
  "maxLimit": 100,
  "results": [ ... ],
  "count": 20,
  "partial": false
}
```

`results` items by type:

- **channel**: `{ type, id, login, displayName, url, description, profileImageURL, followers, isLive, streamTitle, gameName, viewersCount, tags, isPartner }` — `url` is `https://www.twitch.tv/{login}`; `isLive` + stream fields are populated when the channel is broadcasting, otherwise `isLive:false` and the stream fields are null.
- **category**: `{ type, id, name, slug, url, avatarURL, viewersCount, tags }` — `url` is `https://www.twitch.tv/directory/category/{slug}`.
- **video**: `{ type, id, title, url, thumbnailURL, duration, viewCount, publishedAt, author }` — `url` is `https://www.twitch.tv/videos/{id}`, `duration` is in seconds, `publishedAt` is ISO 8601, `author` is the owning channel.

## Usage

```
websculpt twitch search --query "lck"
websculpt twitch search --query "league of legends" --type category --limit 30
websculpt twitch search --query "lck" --type video --limit 100
```

## Common Error Codes

- `MISSING_PARAM` — `query` is required and must not be empty.
- `INVALID_PARAM` — invalid `type` (must be channel/category/video) or non-numeric / out-of-range `limit`.
- `LIMIT_EXCEEDED` — `limit` greater than 100.
- `NETWORK_ERROR` — GraphQL endpoint unreachable after retries.
- `DRIFT_DETECTED` — non-200 HTTP, malformed JSON, missing `searchFor`, or a non-retryable GraphQL error (page/API changed).
