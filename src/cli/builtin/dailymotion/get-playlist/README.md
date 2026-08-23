# dailymotion/get-playlist

## Description

Fetch a Dailymotion playlist by URL or plain ID: playlist name, description, owner, video count, and the videos in playlist order.

Uses the public REST API (`api.dailymotion.com`), which matches the content of the website playlist page (`dailymotion.com/playlist/{id}`). No login and no browser required.

## Parameters

| Param | Required | Default | Meaning |
|-------|----------|---------|---------|
| `url` | yes | - | Playlist URL (`https://www.dailymotion.com/playlist/xa5jms`) or just the ID (`xa5jms`). The last path segment is used as the playlist ID. |
| `limit` | no | 20 | Maximum videos to return (1-100). Paginates internally (100 per page); `partial=true` when the playlist has fewer videos than requested or the API's 1000-video pagination cap is hit. |

## Return Value

```jsonc
{
  "id": "<playlist-id>",
  "name": "<playlist-name>",
  "url": "https://www.dailymotion.com/playlist/<playlist-id>",
  "description": null,                    // null or stripped plain text
  "videosTotal": "<videos-total>",        // may exceed the 1000-video pagination cap
  "private": false,
  "owner": { "id": "<owner-id>", "username": "<owner-username>", "screenname": "<owner-screenname>", "url": "<owner-url>" },
  "videos": [
    { "id": "<video-id>", "title": "<title>", "url": "https://www.dailymotion.com/video/<video-id>",
      "duration": "<duration>", "thumbnail": "<thumbnail-url>",
      "createdAt": "<createdAt>", "views": "<views>",
      "owner": { "screenname": "<owner-screenname>", "username": "<owner-username>", "url": "<owner-url>" } }
  ],
  "partial": false
}
```

- `videos` are in playlist order (the same order the website sidebar shows; the site only rotates the list to the currently-playing video).
- `videosTotal` is the API-reported count (may be larger than what pagination can serve — the API caps playlist video pagination at 1000 items).
- `partial: true` is added only when fewer videos were returned than requested.

## Usage

```
websculpt dailymotion get-playlist --url https://www.dailymotion.com/playlist/<playlist-id> --limit 20
websculpt dailymotion get-playlist --url <playlist-id> --limit 5
websculpt dailymotion get-playlist --url <small-playlist-id>
```

Playlist IDs can be discovered via `websculpt dailymotion search --type playlist` or `websculpt dailymotion get-user --user <user> --tab playlists`.

## Common Error Codes

- `MISSING_PARAM` — `url` was not provided.
- `INVALID_PARAM` — `url` is not a playlist URL/ID, or `limit` is not an integer in 1-100.
- `NOT_FOUND` — the playlist does not exist (API returned HTTP 404).
- `RATE_LIMITED` — Dailymotion returned HTTP 429/403. The command sleeps 200-700ms before every request; retry after a pause.
- `DRIFT_DETECTED` — the API rejected a requested field name (field renamed/removed).
- `COMMAND_EXECUTION_ERROR` — network failure or invalid JSON.
