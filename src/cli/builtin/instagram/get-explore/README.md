# instagram/get-explore

## Description

Fetch Instagram's Explore grid (`https://www.instagram.com/explore/`) — the algorithmic recommendation feed of media from across the platform, personalized to the logged-in account. Returns media tiles (shortcode, URL, type, thumbnail, like/comment counts) with cursor pagination via the first-party `explore_grid` API. Use `instagram/get-post` on any tile URL for the full caption and comments.

## Parameters

| name | required | default | description |
|------|----------|---------|-------------|
| `limit` | no | 20 | Maximum number of tiles to return (1-100). Additional pages are fetched through the `explore_grid` cursor (`max_id`) until the limit is reached; `partial=true` when the grid stops producing new items before the limit. |

## Return Value

```json
{
  "results": [
    {
      "shortcode": "<shortcode>",
      "url": "https://www.instagram.com/p/<shortcode>/",
      "type": "video",
      "thumbnail": "https://scontent-...cdninstagram.com/...",
      "likeCount": 389,
      "commentCount": 3
    }
  ],
  "resultCount": 20,
  "maxLimit": 100,
  "source": "api",
  "pagesFetched": 2,
  "partial": false
}
```

- `results`: array of media tiles. `type` is `"image"` | `"video"` | `"carousel"` (structural classification: has `carousel_media` → carousel; has `video_versions` → video; else image). `thumbnail` is the CDN candidate URL; `likeCount`/`commentCount` may be `null` if absent.
- `resultCount`: number of returned items (capped at `limit`).
- `source`: `"api"` (primary, `explore_grid` REST) or `"dom"` (fallback — extracted from rendered page links; `type`/counts are `null`, `partial` is `true`).
- `partial`: `true` when the grid stopped producing items before reaching `limit`, or when the DOM fallback was used.
- Note: Explore content is personalized and changes on every run — this is expected; the structure is the stable contract.

## Usage

```
websculpt instagram get-explore
websculpt instagram get-explore --limit 50
websculpt instagram get-explore --limit 1
```

## Common Error Codes

- `INVALID_PARAM` — `limit` is not a positive integer (e.g. `--limit 0`, `--limit abc`).
- `LIMIT_EXCEEDED` — `limit` is greater than 100.
- `AUTH_REQUIRED` — Instagram returned 403 / the session is not logged in.
- `DRIFT_DETECTED` — both the API and DOM extraction failed (structure changed or blocked).
- `EMPTY_RESULT` — no explore grid items could be retrieved.
