# vimeo/get-channel

List videos in a Vimeo channel — human-curated collections, the flagship being Vimeo Staff Picks. The command returns the channel profile plus a paginated list of video cards.

## Description

Fetches `vimeo.com/channels/{channel}/videos` (server-side rendered HTML) with the requested sort and paginates internally until the requested limit or the end of the listing. Every request uses the `format:detail` card view so each video carries title, URL, duration, author, view/like/comment counts, thumbnail and description.

Channel info (name, url, description, video/follower/moderator counts, owner, channel id) is always returned from the listing page header and sidebar.

## Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `channel` | string | no | `staffpicks` | Channel slug from the URL `vimeo.com/channels/{channel}`. Works for sub-channels (`premieres`, `bestofstaffpicks`, `thedecade`) and user-created channels (e.g. `music`). |
| `sort` | enum | no | `preset` | `preset` (curator order) \| `date` (newest) \| `alphabetical` \| `plays` (most viewed) \| `likes` \| `duration`. |
| `limit` | number | no | `20` | Maximum videos to return (1–100). The channel lists 12 per page; `partial=true` when the listing runs out. |

## Return Value

```json
{
  "channel": {
    "name": "Example Channel",
    "url": "https://vimeo.com/channels/example",
    "description": "Example channel description",
    "videoCount": "1.2K Videos",
    "followerCount": "1.2K Followers",
    "moderatorCount": "3 Moderators",
    "owner": { "name": "Example Owner", "url": "https://vimeo.com/exampleowner" },
    "channelId": "12345"
  },
  "sort": "preset",
  "requestedLimit": 20,
  "resultCount": 1,
  "pagesFetched": 1,
  "partial": false,
  "videos": [
    {
      "id": "0000001",
      "title": "Example Title",
      "url": "https://vimeo.com/channels/example/0000001",
      "canonicalUrl": "https://vimeo.com/0000001",
      "duration": "00:00",
      "author": { "name": "Example Creator", "url": "https://vimeo.com/examplecreator" },
      "addedAt": "2026-01-01T00:00:00-04:00",
      "views": "1.2K",
      "likes": "12",
      "comments": "3",
      "thumbnail": "https://i.vimeocdn.com/video/<thumb>-d_150x84?region=us",
      "description": "Example description ..."
    }
  ]
}
```

Notes:
- `views`, `likes`, `comments` are `null` when the card has no stats block (some uploads hide them).
- `duration` is `mm:ss` formatted text; `thumbnail` is the 150x84 card image; `description` has HTML entities decoded and may be truncated by Vimeo.
- `videoCount`/`followerCount`/`moderatorCount` are formatted display strings (e.g. `"1.4M Followers"`), not raw integers.
- `partial=true` means the listing was exhausted before the requested limit was reached.

## Usage

```
websculpt vimeo get-channel --channel staffpicks
websculpt vimeo get-channel --channel premieres --sort date --limit 30
websculpt vimeo get-channel --channel music --sort plays
```

## Common Error Codes

- `NOT_FOUND` — channel slug does not exist (HTTP 404 or Vimeo "Page Not Found" page).
- `EMPTY_RESULT` — channel exists but has no videos.
- `INVALID_PARAM` — invalid `sort`, non-numeric/zero `limit`, or malformed `channel` slug.
- `LIMIT_EXCEEDED` — `limit` above 100.
- `MISSING_PARAM` — `channel` empty.
- `RATE_LIMITED` / `ACCESS_DENIED` — Vimeo rejected the request (429 / 403).
- `DRIFT_DETECTED` — page structure changed (channel header or video cards missing).
