# twitch/get-video

Fetch details of a single Twitch video (VOD) by URL or numeric ID (twitch.tv/videos/{id}).

## Description

Video lists (twitch/get-channel-videos, twitch/search --type video) only expose cards. This command takes a VOD URL or numeric ID and returns the full detail for that single video: title, owning channel, game/category, duration, view count, publish date, description, thumbnail, and chapter markers when present. The data comes from Twitch's internal GraphQL (https://gql.twitch.tv/gql) via the user's browser session. Chat replay is a real-time message stream and is intentionally not included. No login required for public VODs; subscriber-only VODs may be inaccessible.

## Parameters

- `url` (required): Full Twitch video URL (`https://www.twitch.tv/videos/2577728783`) or just the numeric id (`2577728783`). URLs come from `twitch/get-channel-videos` or `twitch/search --type video` results.

## Return Value

A single object (not an array):

```json
{
  "title": "HLE vs GEN | Grand Finals | Woori Bank 2025 LCK Playoffs",
  "url": "https://www.twitch.tv/videos/2577728783",
  "channel": { "name": "lck", "displayName": "LCK", "url": "https://www.twitch.tv/lck" },
  "category": { "name": "League of Legends", "slug": "league-of-legends", "url": "https://www.twitch.tv/directory/category/league-of-legends" },
  "duration": 21816,
  "views": 756743,
  "publishedAt": "2025-09-28T04:00:33Z",
  "description": null,
  "chapters": [ { "title": "Just Chatting", "startAt": 0 }, { "title": "Minecraft", "startAt": 8539 } ],
  "thumbnailUrl": "https://static-cdn.jtvnw.net/cf_vods/.../thumb/thumb0-320x180.jpg"
}
```

- `duration`: video length in seconds.
- `publishedAt`: ISO 8601 timestamp.
- `description`: may be `null` (most VODs do not set a description).
- `chapters`: array of `{title, startAt}` where `startAt` is seconds from the start. Empty array when the VOD has no chapters.
- `thumbnailUrl`: thumbnail with dimensions normalized to 320x180.

## Usage

```
websculpt twitch get-video --url https://www.twitch.tv/videos/2577728783
websculpt twitch get-video --url 2577728783
```

Requires Chrome or Edge running with remote debugging enabled. No Twitch login required for public VODs.

## Common Error Codes

- `MISSING_PARAM`: the required `url` parameter was not provided.
- `INVALID_PARAM`: `url` is not a Twitch video URL or numeric video id.
- `NOT_FOUND`: the video does not exist or is unavailable (page shows a core-error / GraphQL returns `video: null`).
- `TIMEOUT`: video details did not load within the wait window (network or page drift).
