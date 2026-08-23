# instagram/get-reels

Fetch Instagram's Reels feed (instagram.com/reels/) — the algorithmic short-video stream. Returns reel cards with author, caption, like/comment/share counts, and the video URL. This is a list command: to read a reel's comments, pass its URL to `instagram/get-post` (reels are structurally posts).

## Description

Fetches the Reels algorithm feed through Instagram's first-party GraphQL API (`/api/graphql`, friendly name `PolarisClipsTabDesktopPaginationQuery`). The full postData template from the initial page request is replayed for each page, updating the `after` cursor and `seen_reels` dedup list. Paginates internally until `limit` reels are collected or the feed is exhausted (`partial=true`).

## Parameters

- `limit` (number, optional, default 20, max 100): Maximum number of reels to return. Internally paginates 10 per API call.

## Return Value

```
{
  limit, maxLimit,
  results: Array<{
    shortcode, url,
    author: { username, profileUrl, isVerified },
    caption, likeCount, commentCount, shareCount, videoUrl, timestamp
  }>,
  resultCount,
  source: "graphql",
  partial: boolean,   // true when the feed was exhausted/stalled before reaching limit
  pagesFetched
}
```

Field mapping:
- `shortcode` = reel short code (e.g. `DbYboWxRlB5`), `url` = `https://www.instagram.com/reels/{shortcode}/`
- `author.username` / `author.profileUrl` / `author.isVerified`
- `caption` = reel caption text (may contain newlines / hashtags)
- `likeCount` = `media.like_count`, `commentCount` = `media.comment_count`, `shareCount` = `media.media_repost_count`
- `videoUrl` = highest-quality entry of `media.video_versions`, `timestamp` = unix seconds (`media.taken_at`)

## Usage

```
websculpt instagram get-reels
websculpt instagram get-reels --limit 50
websculpt instagram get-reels --limit 1
```

## Common Error Codes

- `INVALID_PARAM` — limit is not a positive integer (e.g. `0`, `abc`, `1.5`, `-3`)
- `LIMIT_EXCEEDED` — limit exceeds maxLimit 100
- `DRIFT_DETECTED` — Reels GraphQL request/schema missing; likely login required or Instagram changed the API
- `BROWSER_ATTACH_REQUIRED` — produced by the runner when the browser session is not available

## Prerequisites

Requires Chrome or Edge running with remote debugging enabled and a logged-in Instagram session. Instagram has no public API; every data path needs the authenticated browser session.
