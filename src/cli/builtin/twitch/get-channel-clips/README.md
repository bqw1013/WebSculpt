# twitch/get-channel-clips

## Description

List a Twitch channel's clips — the Clips tab at twitch.tv/{channel}/clips. Clips are short (up to ~60s) viewer-created highlight snippets ranked by popularity within a time window. Use `--range` to choose the ranking window (24h/7d/30d/all) and `--limit` to cap the number of clips returned.

## Parameters

| name | required | default | description |
|---|---|---|---|
| `channel` | yes | - | Channel login name — the path segment in twitch.tv/{channel} (e.g. `xqc`, `lck`). Lowercase. |
| `range` | no | `7d` | Time window for clip ranking: `24h` (热门24小时) / `7d` (热门7天) / `30d` (热门30天) / `all` (热门所有). Maps to GraphQL filter LAST_DAY / LAST_WEEK / LAST_MONTH / ALL_TIME. |
| `limit` | no | `20` | Max clips to return (1-100). Single GraphQL request, no internal pagination; `partial: true` when the server returns fewer than limit. |

## Return Value

```json
{
  "items": [
    {
      "title": "Fellaaaaaaaa",
      "url": "https://www.twitch.tv/xqc/clip/SmokyFragileFoxRedCoat-MRH2eCK-8aE8xUzd",
      "views": 26831,
      "clipper": "puertoricanporo",
      "duration": 29,
      "createdAt": "2026-08-14T01:55:28Z",
      "thumbnailUrl": "https://static-cdn.jtvnw.net/..."
    }
  ],
  "count": 1,
  "limit": 20,
  "range": "7d",
  "partial": true
}
```

- `items`: clip cards; `createdAt` is an ISO 8601 timestamp; `views` and `duration` are numbers; `clipper` is the clip creator's display name.
- `partial`: true when the server returned fewer clips than `limit` (either the channel has fewer clips in the window, or the server capped the first page).

## Usage

```
websculpt twitch get-channel-clips --channel xqc
websculpt twitch get-channel-clips --channel lck --range 30d --limit 50
websculpt twitch get-channel-clips --channel shroud --range all
```

## Common Error Codes

- `MISSING_PARAM` — `channel` is required but was empty.
- `INVALID_RANGE` — `range` is not one of `24h` / `7d` / `30d` / `all`.
- `INVALID_LIMIT` — `limit` is not a positive integer or is outside 1-100.
- `CHANNEL_NOT_FOUND` — the channel does not exist on Twitch.
- `DRIFT_DETECTED` — the GraphQL endpoint returned an unexpected response shape, an HTTP error, or an unknown persisted query.
