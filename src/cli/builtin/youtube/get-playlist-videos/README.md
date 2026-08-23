# youtube/get-playlist-videos

List the videos in a YouTube playlist in the user's attached Chrome session. A playlist is an ordered video collection — the equivalent of a Bilibili 收藏夹/合集. The command reads YouTube's own structured page data (`ytInitialData` + the `/youtubei/v1/browse` continuation endpoint), so it is fast and returns stable fields. It does not open each video's watch page.

## Description

Given a playlist URL or a bare list ID, returns the playlist metadata (title, channel, video count) and its video entries (video ID, title, canonical watch URL, duration, channel). The initial page data already carries up to 100 extractable video entries; when the requested `limit` is not yet covered the command scrolls the page as a best-effort continuation (the page is brought to the front first so YouTube's lazy loading runs). The built-in personal lists `WL` (Watch Later 稍后观看) and `LL` (Liked videos 赞过的视频) work when the browser session is logged in.

## Parameters

- `url` (required): playlist URL (`youtube.com/playlist?list=PL...`) or bare list ID (`PL...`, `UU...`, etc.). The special IDs `WL` and `LL` refer to the logged-in account's Watch Later and Liked-videos lists.
- `limit` (optional, default `50`): maximum number of videos to return, strict positive integer 1-100 (`LIMIT_EXCEEDED` above 100).

## Return Value

```json
{
  "playlist": {
    "id": "PLxxxxxxxxxxxxxxxxxxxxxx",
    "title": "Example Playlist Title",
    "url": "https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxxxxxxxx",
    "channel": { "name": "Example Channel", "url": "https://www.youtube.com/@ExampleChannel", "channelId": "UCxxxxxxxxxxxxxxxxxxxxxx" },
    "videoCount": 14
  },
  "items": [
    { "videoId": "dQw4w9WgXcQ", "title": "Example video title", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "duration": "10:30", "channel": "Example Channel" }
  ],
  "partial": false
}
```

- `playlist.channel` may be `null` when the header has no channel link (rare; always present for channel-owned public playlists).
- `items[].duration` is `null` for live/upcoming entries that render no duration badge.
- `partial` is `true` when the playlist stream was exhausted before reaching `limit` (including empty playlists, which return `items: []`). It is `false` when the returned count equals `limit`.
- Extra tracing fields: `resultCount`, `source` (`"ytInitialData"` or `"dom"`), `pagesFetched`, `maxLimit`, and on the DOM fallback `fallbackUsed`/`fallbackReason`.

## Usage

```bash
websculpt youtube get-playlist-videos --url "https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxxxxxxxx"
websculpt youtube get-playlist-videos --url PLxxxxxxxxxxxxxxxxxxxxxx
websculpt youtube get-playlist-videos --url PLxxxxxxxxxxxxxxxxxxxxxx --limit 100
websculpt youtube get-playlist-videos --url WL          # Watch Later (needs login)
websculpt youtube get-playlist-videos --url LL          # Liked videos (needs login)
```

The returned `items[].videoId` and `items[].url` chain directly into `youtube/get-video`; `playlist.channel.url` chains into `youtube/channel-info` / `youtube/channel-videos`.

## Browser and pacing

Chrome/Edge remote debugging must be enabled so the WebSculpt browser daemon can attach to the user's existing session. No YouTube API key or separate login is required for public playlists; `WL`/`LL` and private playlists require a logged-in session. The command uses short randomized waits after navigation, a gentle random pointer move, and between serial continuation requests. It performs no write operations and does not click any interactive buttons.

## Common Error Codes

- `MISSING_PARAM`: `url` is absent or blank.
- `INVALID_PARAM`: malformed `limit`, or a `url` from which no list ID can be extracted.
- `LIMIT_EXCEEDED`: `limit` is greater than 100.
- `NOT_FOUND`: the list ID is invalid and YouTube redirected to the homepage.
- `AUTH_REQUIRED`: the playlist needs login (e.g. `WL`/`LL` when the session is logged out).
- `DRIFT_DETECTED`: both the `ytInitialData` path and the visible-DOM fallback failed.
- `BROWSER_ATTACH_REQUIRED`, `DAEMON_BUSY`, and `COMMAND_TIMEOUT` may be emitted by the browser runner.
