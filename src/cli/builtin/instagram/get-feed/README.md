# instagram/get-feed

## Description

Fetch the Instagram home feed (`instagram.com/`) — the timeline of accounts you follow, mixed with suggested posts and ads. Every item is labeled with its source (`following`, `suggested`, or `ad`). Returns post cards with author, caption, like/comment counts, timestamp, and media URLs. The command scrolls internally up to 100 items and sets `partial: true` when the feed stops producing new items.

## Parameters

- `limit` (optional, default `20`): maximum number of posts to return, strict integer from 1 to 100.

## Return Value

Returns an object with `results`, `resultCount`, `maxLimit`, `partial`, and `pagesFetched`. Each result has:

- `shortcode`, `url` — `https://www.instagram.com/p/{shortcode}/`
- `type` — `image` | `video` | `carousel`
- `author` — `{ username, profileUrl }`
- `caption`
- `likeCount`, `commentCount`, `timestamp` (`taken_at`, unix seconds)
- `media` — array of `{ type: "image"|"video", url }`
- `source` — `following` | `suggested` | `ad`

## Usage

```
websculpt instagram get-feed --limit 20
```

## Prerequisites

An existing logged-in Instagram browser session is required. The command does not automate login and does not bypass CAPTCHA, 403, 429, or other challenges.

## Common Error Codes

- `INVALID_PARAM`: limit is not a positive integer.
- `LIMIT_EXCEEDED`: limit is greater than 100.
- `DRIFT_DETECTED`: the feed GraphQL path yielded no feed items.
