# vimeo/get-video

Fetch a Vimeo video's full metadata from its watch page (vimeo.com/{id}): title, description, duration, dimensions, upload time, privacy level, thumbnails, uploader, and exact views/likes. Optionally returns the video's transcript/subtitles and its comment thread.

## Description

The listing commands (`vimeo/search`, planned `get-category`/`get-channel`) only return video cards. This command retrieves the full detail of a single Vimeo video from its canonical watch page (`vimeo.com/{id}`), reading the Next.js `__NEXT_DATA__` payload plus the authenticated `api.vimeo.com` video/comments endpoints. Comments are uploader-enabled per video — when comments are off, the command returns an empty list with `commentsDisabled=true`. Public videos need no login.

## Parameters

- `url` (required): Video URL (`https://vimeo.com/1188438376`) or just the numeric ID. Channel-context URLs (`vimeo.com/channels/staffpicks/{id}`) are accepted too — the canonical video page is resolved by extracting the trailing numeric ID. Note: custom-slug URLs (`vimeo.com/{user}/{slug}`) and On Demand/live pages are not supported (the latter raise `DRIFT_DETECTED`).
- `include_transcript` (optional, default `false`): Set to `true` to also return the video's transcript/subtitles when available. Not all videos have one.
- `include_comments` (optional, default `false`): Set to `true` to also fetch the comment thread.
- `comment_limit` (optional, default `20`, 1-100): Maximum comments to return. Only used when `include_comments` is true; `partial=true` when the thread is exhausted.
- `comment_sort` (optional, default `newest`): `newest` | `oldest`. Maps to the page's sort dropdown (Newest/Oldest).

## Return Value

```json
{
  "id": "0000001",
  "title": "Example Title",
  "description": "plain text description",
  "url": "https://vimeo.com/0000001",
  "duration": 123,
  "width": 1920,
  "height": 1080,
  "createdAt": "2026-01-01T00:00:00+00:00",
  "contentRating": "safe",
  "privacy": { "view": "anybody", "embed": "public", "download": false, "add": true, "comments": "anybody" },
  "pictures": ["https://i.vimeocdn.com/video/<thumb>_1920x1080?...", "..."],
  "user": { "name": "Example Creator", "url": "https://vimeo.com/examplecreator" },
  "stats": { "views": 12345, "likes": 123, "commentCount": 12 },
  "tags": ["example", "placeholder", "..."],
  "transcript": "..." | null,
  "commentsDisabled": false,
  "comments": [ { "author": "Example Commenter", "authorUrl": "https://vimeo.com/examplecommenter", "time": "2026-01-01T00:00:00+00:00", "text": "Example comment text", "replyCount": 0 } ],
  "partial": false
}
```

Notes:
- `stats.views` is `null` when the uploader hides the play count.
- `transcript` is present only when `include_transcript=true`; it is `null` when the video has no captions/transcript.
- `comments`/`commentsDisabled` are present only when `include_comments=true`.
- `tags` comes from the page's JSON-LD keywords (empty array when absent).

## Usage

```
websculpt vimeo get-video --url 1188438376
websculpt vimeo get-video --url https://vimeo.com/channels/staffpicks/1188438376 --include_comments true --comment_limit 40
websculpt vimeo get-video --url 22439234 --include_comments true --comment_sort oldest
websculpt vimeo get-video --url 1188438376 --include_transcript true
```

## Common Error Codes

- `MISSING_PARAM`: the required `url` parameter is missing or empty.
- `INVALID_PARAM`: `url` is not a Vimeo video URL/numeric ID, or a numeric/enum parameter is malformed.
- `LIMIT_EXCEEDED`: `comment_limit` exceeds 100.
- `NOT_FOUND`: the video is unavailable or private (no clip data on the page).
- `DRIFT_DETECTED`: the page no longer embeds `__NEXT_DATA__` (structure changed).
- `AUTH_REQUIRED`: (reserved) the browser session could not supply the anonymous API token.
