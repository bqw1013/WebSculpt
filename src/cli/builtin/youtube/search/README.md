# youtube/search

Search public YouTube results in the user's attached Chrome session. The command is video-first and also supports the verified `channel` and `playlist` search filters. It does not open video/channel detail pages and does not manage subscriptions or playlists.

## Description

The command reads YouTube's own structured search page data, follows continuation pagination internally, and falls back to visible result DOM only when the page-data path drifts.

## Parameters

- `query` (required): search text.
- `limit` (optional, default `20`): strict positive integer; maximum `100` (`LIMIT_EXCEEDED` above the maximum).
- `type` (optional, default `video`): `video`, `channel`, or `playlist`.
- `sort` (optional, default `default`): `default` maps to YouTube relevance; `popular` maps to YouTube's verified popular filter; `latest` is accepted for interface compatibility but YouTube's current search UI has no stable latest-sort link, so it is returned in `ignoredParams` and the query uses the default order.
- `time` (optional, default `all`): `day`, `week`, `month`, `year`, or `all`. Upload-date filters are verified for video searches. For channel/playlist searches, and when combined with `popular`, YouTube disables the upload-date filter; such values are ignored and reported.

## Return Value

The result preserves the native page-data records under `results[].native`. Video records include directly available `videoId`, title, canonical watch URL, channel name/channelId/channel URL, published text, duration, thumbnail, description/snippet, and view/like/comment text metrics (missing platform fields are `null`). Channel records preserve channelId, title, canonical URL, description, thumbnail, subscriber text, and video-count text. Playlist records preserve playlistId, title, canonical URL, creator/type, metadata rows, sample-video/update text, thumbnail, and the native lockup model.

The envelope includes `query`, effective `type/sort/time`, `maxLimit: 100`, `resultCount`, `pagesFetched`, `estimatedResults`, `source: "ytInitialData"`, `fallbackUsed: false`, and a compact `nativeEnvelope`. If page JSON is unavailable or fails schema/transport checks, visible-page extraction is attempted and marked `source: "dom"`, `fallbackUsed: true`, `partial: true`, and `fallbackReason`. If both paths fail, the command throws `DRIFT_DETECTED`.

## Usage

```bash
websculpt youtube search --query "artificial intelligence" --limit 10
websculpt youtube search --query "machine learning" --type channel --sort popular --limit 5
websculpt youtube search --query "robotics" --time week --limit 10
```

## Browser and pacing

Chrome/Edge remote debugging must be enabled so the WebSculpt browser daemon can attach to the user's existing session. No YouTube API key or separate login is required for public results in the verified environment. The command uses short randomized waits after navigation, between serial continuation requests, and before return. It performs at most seven continuation requests, does not fan out to detail pages, and does not perform bulk scrolling.

## Common Error Codes

- `MISSING_PARAM`: `query` is absent or blank.
- `INVALID_PARAM`: malformed limit or unsupported type/sort/time value.
- `LIMIT_EXCEEDED`: limit is greater than 100.
- `DRIFT_DETECTED`: ytInitialData/continuation schema and visible DOM fallback both failed.
- `BROWSER_ATTACH_REQUIRED`, `DAEMON_BUSY`, and `COMMAND_TIMEOUT` may be emitted by the browser runner.
