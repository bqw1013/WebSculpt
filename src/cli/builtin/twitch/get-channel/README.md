# twitch/get-channel

Fetch a Twitch channel's profile and current live status via Twitch's internal GraphQL (no login).

## Description

Returns a channel's display name, follower count, description, avatar, and — when the channel is broadcasting — the live title, category, viewer count, and stream start time. It is the entry point for "look at a streamer": pass any channel login and get both the static profile and the current live state in one structured object.

## Parameters

| Name | Required | Description |
|------|----------|-------------|
| `channel` | yes | Channel login name, the path segment in `twitch.tv/{channel}` (e.g. `gorgc` from `twitch.tv/gorgc`). Case-insensitive (`LCK` resolves to `lck`). Non-existent channels return `CHANNEL_NOT_FOUND`. |

## Return Value

```jsonc
{
  "channel": "gorgc",            // normalized lowercase login
  "displayName": "Gorgc",        // display name (may be non-ASCII, e.g. Chinese)
  "followers": 781579,           // follower count (number)
  "description": ":)",           // channel description; null when empty
  "avatarUrl": "https://static-cdn.jtvnw.net/...300x300.jpeg", // profile image
  "isLive": true,                // whether the channel is broadcasting now
  "live": {                      // present ONLY when isLive is true
    "title": "UNBANNED - FANTASY TOP 99.99% - PREDICTIONS - RECAP",
    "category": "Dota 2",        // current live category name
    "viewers": 4759,             // current viewer count
    "startedAt": "2026-08-17T11:06:24Z" // stream start time (ISO 8601)
  },
  "url": "https://www.twitch.tv/gorgc"
}
```

When the channel is offline, `isLive` is `false` and the `live` field is omitted.

## Usage

```
websculpt twitch get-channel --channel gorgc
websculpt twitch get-channel --channel lck
websculpt twitch get-channel --channel <cn-channel>   # Chinese-language channel
```

## Common Error Codes

- `MISSING_PARAM` — `channel` parameter is missing or blank.
- `CHANNEL_NOT_FOUND` — the channel login does not exist on Twitch.
- `DRIFT_DETECTED` — GraphQL endpoint unreachable, non-200 response, persisted-query hash stale (`PersistedQueryNotFound`), or the response shape no longer matches the expected operations.
