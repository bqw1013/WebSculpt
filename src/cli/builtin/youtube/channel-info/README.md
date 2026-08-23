# youtube/channel-info

## Description

Fetch a YouTube channel's profile card: name, @handle, channel ID, avatar, subscriber count, total video count, and full description. A channel is YouTube's creator identity — the equivalent of a Bilibili UP主 or a Douyin author. Lightweight: it does not fetch the channel's content list (use `youtube/channel-videos` for that).

## Parameters

| Name      | Required | Description |
|-----------|----------|-------------|
| `channel` | yes      | Channel @handle or channel URL. Four input forms: `@handle` (e.g. `@ExampleChannel`), `youtube.com/@handle/` (trailing slash optional), `youtube.com/channel/UC...` (channel ID URL), `youtube.com/c/...` (legacy custom URL). Discovery: click the channel name under any video, or use the `channel.handle` / `channel.channelId` field from `youtube/get-video`. A bare name without `@` is auto-completed to an @handle. |

## Return Value

```json
{
  "name": "Example Channel Name",
  "handle": "@ExampleChannel",
  "channelId": "UCxxxxxxxxxxxxxxxxxxxxxx",
  "url": "https://www.youtube.com/@ExampleChannel",
  "avatar": "https://yt3.googleusercontent.com/...",
  "subscribers": "130万位订阅者",
  "videoCount": "3654 个视频",
  "description": "full channel description text"
}
```

- `name` — channel display name.
- `handle` — @handle, or empty string if the channel has none.
- `channelId` — stable channel ID (`UC...`).
- `url` — canonical `https://www.youtube.com/@handle` (falls back to `/channel/UC...` when no handle).
- `avatar` — avatar image URL, or `null` if unavailable.
- `subscribers` — localized subscriber-count text (e.g. `130万位订阅者`), empty string if hidden.
- `videoCount` — localized video-count text (e.g. `3654 个视频`), empty string if hidden.
- `description` — full channel description (newlines preserved).

`subscribers` / `videoCount` are returned as the localized display strings exactly as YouTube shows them; locale is whatever the browser is set to (the extraction regex covers both Chinese `位订阅者`/`个视频` and English `subscribers`/`videos`).

## Usage

```
websculpt youtube channel-info --channel @ExampleChannel
websculpt youtube channel-info --channel "https://www.youtube.com/@ExampleChannel/"
websculpt youtube channel-info --channel "https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx"
websculpt youtube channel-info --channel "https://www.youtube.com/c/ExampleChannel"
```

## Common Error Codes

- `MISSING_PARAM` — `channel` was not provided or is empty.
- `CHANNEL_NOT_FOUND` — the channel URL did not resolve to a real channel (404), e.g. a `/c/` alias the channel does not own.
- `DRIFT_DETECTED` — the channel page loaded but `ytInitialData` no longer has the expected header structure.
