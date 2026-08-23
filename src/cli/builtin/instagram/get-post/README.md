# instagram/get-post

Fetch a single Instagram post or reel by URL and read its full text and comments.

## Description

Given a post or reel URL, returns the complete post: author, full caption, like/comment counts, publish timestamp, and media URLs (image / video / carousel / reel). Optionally loads the comment thread — top-level comments paginate with a cursor and nested replies ("view all N replies") are expanded automatically. Both `/p/{shortcode}/` and `/reel/{shortcode}/` URLs are accepted; reel URLs are normalized to `/p/{shortcode}/` because `/reel/` redirects to the reels browse feed. Requires a logged-in Instagram session.

## Parameters

- `url` (string, required): Post or reel URL. Accepted forms:
  - `https://www.instagram.com/p/{shortcode}/`
  - `https://www.instagram.com/{username}/p/{shortcode}/`
  - `https://www.instagram.com/reel/{shortcode}/`
- `include_comments` (boolean, optional, default `false`): Load the comment thread. When enabled, top-level comments paginate and nested replies expand one by one; replies count toward `comment_limit`.
- `comment_limit` (number, optional, default `20`, 1–100): Maximum comments to return, counting nested replies. Only used when `include_comments` is true.

## Return Value

```json
{
  "post": {
    "shortcode": "Dbv-ZWKkfop",
    "url": "https://www.instagram.com/p/Dbv-ZWKkfop/",
    "type": "carousel",
    "author": { "username": "shopify", "profileUrl": "https://www.instagram.com/shopify/" },
    "caption": "spin up a Shopify store with v0, Manus, or Lovable",
    "likeCount": 592,
    "likeCountHidden": false,
    "commentCount": 104,
    "timestamp": "2026-08-08T...Z",
    "isReel": false,
    "media": [ { "type": "video", "url": "https://scontent..." }, { "type": "video", "url": "..." } ]
  },
  "comments": [
    {
      "id": "18112402343059645",
      "author": { "username": "nourrrsamirr" },
      "text": "I need my money back!!!",
      "likeCount": 6,
      "timestamp": "...",
      "replies": [ { "id": "17911163517263671", "author": { "username": "campbellhenry29" }, "text": "@nourrrsamirr 😢", "likeCount": 0, "timestamp": "..." } ]
    }
  ],
  "partial": true
}
```

Notes:
- `type` is one of `image | video | carousel | reel`. `isReel` is true when the media is a reel (`product_type: "clips"`).
- `likeCountHidden` is true when Instagram hides the like count (common on reels); in that case `likeCount` is a placeholder value.
- `partial: true` is set when the comment thread was truncated by `comment_limit` (more comments exist but were not fetched).

## Usage

```
websculpt instagram get-post --url "https://www.instagram.com/p/Dbv-ZWKkfop/"
websculpt instagram get-post --url "https://www.instagram.com/p/Dbv-ZWKkfop/" --include_comments true --comment_limit 20
websculpt instagram get-post --url "https://www.instagram.com/reel/Dau_m7dP2DH/"
```

## Common Error Codes

- `MISSING_PARAM` — `url` is empty or not provided.
- `INVALID_PARAM` — `url` is not an Instagram post/reel URL, or `comment_limit` is not a positive integer.
- `LIMIT_EXCEEDED` — `comment_limit` > 100.
- `AUTH_REQUIRED` — Instagram login session is required (not logged in).
- `NOT_FOUND` — the shortcode does not exist (Instagram "page isn't available").
- `DRIFT_DETECTED` — the embedded post data key or a GraphQL body could not be found (site structure changed).
