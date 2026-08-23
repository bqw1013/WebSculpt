# stocktwits/get-feed

Fetch Stocktwits' site-wide trending feed — exactly what the anonymous homepage (`stocktwits.com/`) shows: the trending posts across all symbols right now. This is a platform-wide pulse view, not a per-symbol feed. Backed by the public JSON API `api.stocktwits.com/api/2/streams/trending.json`. No login and no browser required.

## Description

`websculpt stocktwits get-feed` returns the latest trending posts with their body, timestamp, sentiment tag, like count, author profile, and mentioned symbols. It is **not personalized** — no account context is involved. Pagination is handled internally (30 per API page, `max` cursor), so `--limit` can request up to 100 posts.

## Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `--limit` | no | `20` | Max posts to return (integer 1-100). The API serves 30 per page; larger values fetch multiple pages internally. `partial=true` when the stream is exhausted before the limit. |

## Return Value

```jsonc
{
  "posts": [
    {
      "id": 100000001,                       // numeric post id (monotonic = time order)
      "url": "https://stocktwits.com/example_user/message/100000001",  // permalink (username form is the only verified 200)
      "body": "$SPY example post body",
      "createdAt": "2026-08-20T13:44:28Z",   // ISO 8601 UTC
      "sentiment": null,                     // "Bullish" | "Bearish" | null (no tag)
      "likeCount": 1,                        // likes.total, 0 when the likes key is absent
      "user": {
        "id": 1000000,
        "username": "example_user",
        "name": "Example User",
        "avatarUrl": "https://...",          // avatar_url_ssl
        "followers": 62,
        "ideas": 4483
      },
      "symbols": ["SPY"]                     // from message.symbols[].symbol
    }
  ],
  "partial": false                           // true when the stream ran out before the requested limit
}
```

An exhausted stream returns `{ "posts": [...fewer than limit...], "partial": true }` — a successful result, not an error. A truly empty feed (never observed in practice) would return `{ "posts": [], "partial": true }`.

## Usage

```bash
# Default 20 trending posts
websculpt stocktwits get-feed

# Explicit count
websculpt stocktwits get-feed --limit 5

# Single post (smallest valid)
websculpt stocktwits get-feed --limit 1

# Deep view — paginates 4 pages internally (30/page)
websculpt stocktwits get-feed --limit 100
```

## Common Error Codes

| Code | Meaning |
|---|---|
| `INVALID_PARAM` | `--limit` is not an integer in 1-100 (e.g. `0`, `-1`, `abc`). |
| `RATE_LIMITED` | API returned HTTP 429/403 on all retries (exploration showed this is rare). |
| `API_ERROR` | API returned a non-2xx status (e.g. 5xx). |
| `NETWORK_ERROR` | Could not reach the API after 3 attempts (network/connection failure). |
| `DRIFT_DETECTED` | Response no longer has the expected `messages` array / non-JSON body — the API shape changed. |
