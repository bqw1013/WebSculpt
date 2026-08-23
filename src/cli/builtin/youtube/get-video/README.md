# youtube/get-video

Fetch full metadata for a single YouTube video, with optional comment thread loading.

## Description

Returns the complete metadata of one video: title, channel (name, handle, channel ID, URL, subscriber count), view count, like count, publish date, duration, category, full description, and live flag. The `url` parameter accepts four input forms — `youtube.com/watch?v={id}`, `youtube.com/shorts/{id}`, `youtu.be/{id}`, or a bare 11-character video ID — all normalized to the same `/watch?v={id}` page. Pass `--include-comments true` to also load top-level comments, sorted by top (default) or newest, expanded by scrolling. Comments are capped at 100 and slow the command down.

## Parameters

| Parameter | Required | Default | Meaning |
|---|---|---|---|
| `url` | yes | - | Video URL or bare 11-char video ID. Accepts `watch?v={id}` / `shorts/{id}` / `youtu.be/{id}` / bare ID. |
| `include_comments` | no | `false` | Set `true` to also fetch the comment thread. |
| `comment_limit` | no | `20` | Top-level comment cap (1-100). Only used when `include_comments` is true. `partial=true` when the thread ends early. |
| `comment_sort` | no | `top` | `top` (最热门/置顶, default) or `newest` (最新). |

## Return Value

```json
{
  "video": {
    "videoId": "string",
    "title": "string",
    "url": "https://www.youtube.com/watch?v={videoId}",
    "channel": { "name": "string", "handle": "string|null", "channelId": "string", "url": "string", "subscribers": "string" },
    "views": "string",
    "likes": "number",
    "publishDate": "string (ISO)",
    "duration": "number (seconds)",
    "category": "string",
    "description": "string (full)",
    "isLive": "boolean"
  },
  "comments": [
    { "author": "string", "text": "string", "likes": "string", "publishedAt": "string", "replyCount": "number" }
  ],
  "partial": "boolean"
}
```

Notes:
- `channel.handle` is `null` for legacy channels whose link is `/channel/UC...`; `channel.url` is the raw link.
- `channel.subscribers` is the page's localized text (e.g. `130万位订阅者`).
- `views` is the raw count string; `likes` is parsed from the like button's localized aria-label.
- Comment `publishedAt` is the page's relative time text (e.g. `1天前`), `likes` is the localized like text (e.g. `30万`), `replyCount` is the integer count of replies.
- `partial` is `true` when some but fewer than `comment_limit` top-level comments loaded (stream exhausted).

## Usage

```
websculpt youtube get-video --url "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
websculpt youtube get-video --url "dQw4w9WgXcQ" --include-comments true --comment-limit 20 --comment-sort top
websculpt youtube get-video --url "https://youtu.be/dQw4w9WgXcQ"
```

## Common Error Codes

- `MISSING_PARAM` — required `url` was not provided.
- `INVALID_URL` — the URL/value does not contain an extractable 11-char YouTube video ID.
- `INVALID_PARAM` — `comment_limit` is not an integer in 1-100, or `comment_sort` is not `top`/`newest`.
- `NOT_FOUND` — the video is unavailable, region-blocked, or does not exist.
- `DRIFT_DETECTED` — the watch page loaded but `ytInitialPlayerResponse` was not found (page structure changed).
