# instagram/get-profile

Fetch an Instagram profile header plus a media grid from one of the profile's content tabs.

## Description

Returns account metadata (username, display name, bio, external link, avatar, post/follower/following counts, verification, private flag) and the first `limit` media items from the chosen tab: posts (default), reels, reposts, or tagged. The grid lazy-loads internally using the same pagination cursors the profile page uses, up to 100 items. `partial: true` is set when the tab is exhausted before reaching `limit`.

Follower/following full lists are intentionally not included — Instagram restricts them to the account owner.

## Parameters

| name | required | default | description |
|------|----------|---------|-------------|
| `user` | yes | — | Username as it appears in the profile URL (`instagram.com/{user}/`, e.g. `shopify`). |
| `tab` | no | `posts` | `posts` (main grid) \| `reels` (short videos) \| `reposts` (reposted content) \| `tagged` (posts this account is tagged in). |
| `limit` | no | `20` | Maximum grid items (1–100). Scrolls internally; `partial: true` when exhausted. |

## Return Value

```json
{
  "profile": {
    "username": "shopify",
    "name": "Shopify",
    "bio": "The entrepreneurship company",
    "externalUrl": "https://shopify.supply/",
    "avatar": "https://scontent-...cdninstagram.com/...",
    "postCount": 3702,
    "followerCount": 2601630,
    "followingCount": 1694,
    "isVerified": true,
    "isPrivate": false
  },
  "posts": [
    {
      "shortcode": "Dbv-ZWKkfop",
      "url": "https://www.instagram.com/p/Dbv-ZWKkfop/",
      "type": "image|video|carousel",
      "caption": "…",
      "likeCount": 358,
      "commentCount": 47,
      "timestamp": 1786730669,
      "thumbnail": "https://scontent-...cdninstagram.com/..."
    }
  ],
  "partial": false,
  "pagesFetched": 1
}
```

- `type` maps from Instagram `media_type`: 1 → image, 2 → video, 8 → carousel.
- Reels (video) URLs use `/reel/{shortcode}/`; reposted items point to the original author's URL.
- Reels items may return `caption: null` and `timestamp: null` — Instagram's reels response no longer includes those fields.
- `pagesFetched` reports how many grid pages were fetched (useful for diagnostics).

## Usage

```
websculpt instagram get-profile --user shopify
websculpt instagram get-profile --user shopify --tab reels --limit 50
websculpt instagram get-profile --user nasa --tab tagged --limit 5
```

## Common Error Codes

- `MISSING_PARAM` — required `user` not provided.
- `INVALID_PARAM` — `tab` not in `posts|reels|reposts|tagged`, or `limit` not a positive integer.
- `LIMIT_EXCEEDED` — `limit` above 100.
- `NOT_FOUND` — no profile response for the username (nonexistent account, or profile query did not fire).
- `DRIFT_DETECTED` — the GraphQL response schema or friendly name changed (Instagram update).
