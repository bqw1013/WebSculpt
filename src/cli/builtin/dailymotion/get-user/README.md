# dailymotion/get-user

Fetch a Dailymotion uploader's page as shown on the site: header profile (screenname, @username, avatar, description, follower/video/playlist/view counts, verified, joined date) plus one sub-page list (videos / featured playlists). Browser-based, so the list ordering matches what website visitors see.

## Description

`dailymotion/get-user` reads an uploader's profile at `dailymotion.com/user/{username}`. The header returns profile data merged from the public Dailymotion API (the page header itself does not display counts). `tab` picks the sub-page to list: `videos` (视频, default), `feed` (最新动态, the root activity view — currently renders the same video grid as videos), or `playlists` (播放列表, the profile's featured non-empty playlists). `sort` switches the video list between `recent` (最新动态, default) and `visited` (观看最多的, `?sort=visited`). The `user` parameter accepts both an ID (`x1vy1cl`) and a username (`beinsports-hk`); an ID is resolved to its username via the public API first, because the site returns "Not Found" for ID-form URLs.

## Parameters

- `user` (required): Dailymotion user ID (`x1vy1cl`) or username (`beinsports-hk`). Both forms resolve to the same uploader. Discover via `dailymotion/search --type user` or a video's uploader link.
- `tab` (optional, default `videos`): `videos` | `feed` | `playlists`. Header fields are always returned regardless of tab.
- `sort` (optional, default `recent`): `recent` (最新动态) | `visited` (观看最多的). Only used when `tab` is `videos` or `feed`.
- `limit` (optional, default 20, 1-100): Maximum items to return. Scrolls internally up to the limit; `partial: true` when the stream is exhausted.

## Return Value

```jsonc
{
  "user": {
    "id": "<user-id>",
    "username": "<username>",
    "screenname": "<screenname>",
    "url": "https://www.dailymotion.com/user/<username>",
    "avatar": "https://s2.dmcdn.net/u/<avatar-id>/240x240",
    "description": "<description or empty>",
    "followerCount": 1234,
    "followingCount": 0,
    "videoCount": 5678,
    "playlistCount": 9,
    "viewCount": 12345678,
    "verified": true,
    "country": "GB",
    "createdAt": "2016-11-15T06:48:03.000Z"
  },
  "tab": "videos",
  "sort": "recent",
  "items": [
    {
      "id": "<video-id>",
      "title": "<video-title>",
      "url": "https://www.dailymotion.com/video/<video-id>",
      "duration": "0:39",
      "thumbnail": "https://s1.dmcdn.net/...",
      "publishedAt": "<localized absolute time>",
      "publishedAgo": "<relative time>"
    }
  ],
  "partial": false
}
```

For `tab=playlists`, each item is `{ id, name, url, thumbnail, videoCount, publishedAt, publishedAgo }`. `partial` is `true` when the stream ran out before reaching `limit`.

Thumbnails are lazy-rendered on the site and the command scrolls to fill them, so retrieval of larger lists takes a bit longer. A card whose image genuinely never loads reports `thumbnail: null`.

## Usage

```
websculpt dailymotion get-user --user beinsports-hk --tab videos --sort recent --limit 20
websculpt dailymotion get-user --user x1vy1cl --tab playlists
websculpt dailymotion get-user --user beinsports-hk --tab videos --sort visited --limit 5
```

Requires Chrome or Edge running with remote debugging enabled. Public pages need no login; a logged-in session is recommended for the personalized locale.

## Common Error Codes

- `MISSING_PARAM`: `user` is required.
- `INVALID_PARAM`: `tab`/`sort` is not an allowed value, or `limit` is not a positive integer.
- `LIMIT_EXCEEDED`: `limit` is greater than 100.
- `NOT_FOUND`: the user does not exist (public API returns 404) or the browser page resolved to "Not Found".
- `API_ERROR`: the Dailymotion user API request failed or returned unexpected data.
- `DRIFT_DETECTED`: the page structure changed and expected selectors were not found.
