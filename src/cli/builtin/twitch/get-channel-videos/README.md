# twitch/get-channel-videos

List a Twitch channel's videos (VOD archive).

## Description

This command lists a Twitch channel's own long-form videos from the Videos tab at `twitch.tv/{channel}/videos`. Videos are the channel's past broadcasts (full stream replays), highlights, and uploads — distinct from clips, which are short viewer-created snippets. The command queries Twitch's internal GraphQL API directly over plain HTTP (`gql.twitch.tv/gql`, persisted operation `FilterableVideoTower_Videos`) using the public web Client-ID. No login and no browser are required.

Filter by video type with `--type`, and cap the number of results with `--limit`. The API limit is set directly, so there is no page-turn loop; `partial: true` in the output means the channel has more videos than were returned.

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `channel` | yes | — | Channel login name from `twitch.tv/{channel}` (e.g. `lck`). Lowercase. |
| `type` | no | `all` | Video type filter. `all` (全部/所有视频), `past-broadcasts` (过往直播, full stream replays), `highlights` (精选内容), `uploads` (上传). Maps to the filter dropdown on the Videos tab and to GraphQL `broadcastType` `null` / `ARCHIVE` / `HIGHLIGHT` / `UPLOAD`. The page's extra `播放列表` (collections) option is a separate content type and is not covered by this command. |
| `limit` | no | `20` | Maximum number of videos to return (1-100). Sets the GraphQL `limit` directly. |

## Return Value

```json
{
  "channel": "lck",
  "type": "all",
  "limit": 3,
  "results": [
    {
      "title": "HLE vs GEN | Grand Finals | Woori Bank 2025 LCK Playoffs",
      "url": "https://www.twitch.tv/videos/2577728783",
      "duration": "6:03:36",
      "durationSeconds": 21816,
      "views": 756743,
      "publishedAt": "2025-09-28T04:00:33Z",
      "category": { "name": "League of Legends", "slug": "league-of-legends" },
      "thumbnailUrl": "https://static-cdn.jtvnw.net/cf_vods/.../thumb0-320x180.jpg"
    }
  ],
  "count": 3,
  "partial": true,
  "channelFound": true
}
```

Field notes:
- `url` — canonical video URL built from the video id.
- `duration` — human-readable `H:MM:SS` (or `M:SS` under an hour); `durationSeconds` is the raw seconds.
- `publishedAt` — absolute ISO timestamp (the page only shows relative text like "去年").
- `category` — `{ name, slug }`; the slug can feed other Twitch commands that accept a category slug.
- `partial` — `true` when the channel has more videos than requested (`pageInfo.hasNextPage`).
- `channelFound` — `false` when the channel does not exist.

## Usage

```bash
websculpt twitch get-channel-videos --channel lck
websculpt twitch get-channel-videos --channel shroud --type past-broadcasts --limit 50
websculpt twitch get-channel-videos --channel shroud --type highlights --limit 10
```

## Common Error Codes

| Code | Meaning |
|------|---------|
| `MISSING_PARAM` | `channel` is required. |
| `INVALID_TYPE` | `type` is not one of `all`, `past-broadcasts`, `highlights`, `uploads`. |
| `INVALID_LIMIT` | `limit` is not a positive integer. |
| `LIMIT_EXCEEDED` | `limit` is greater than 100. |
| `DRIFT_DETECTED` | Twitch's GraphQL response structure, endpoint, or persisted query changed. |
