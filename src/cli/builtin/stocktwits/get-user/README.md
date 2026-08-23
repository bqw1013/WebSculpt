# stocktwits/get-user

## Description

Fetch a Stocktwits user's profile and posts — the equivalent of opening `stocktwits.com/{username}`. Data is sourced from the anonymous public REST endpoint `api.stocktwits.com/api/2/streams/user/{username}.json`.

Returns the user profile (username, display name, avatar, join date, followers / following / ideas counts, total likes received, premium tier, badges) plus their post stream. Each post carries an id, constructed URL, body, creation time, sentiment tag (`Bullish` / `Bearish` / `null`), like count, a summary of the author, and the mentioned symbols. A `pinnedMessage` is included when the account has one.

`filter` picks the feed view: `top` (default, the site's ranked view) | `bullish` (only Bullish-tagged posts) | `bearish` (only Bearish-tagged posts) | `all` (newest). Paginates internally up to `--limit` (max 100); `partial=true` when the stream is exhausted.

Runtime is **node** — anonymous public API, no login, no cookie, no signature, no browser. Only a Chrome User-Agent is required.

## Parameters

| name | required | description |
|---|---|---|
| `username` | yes | The user's handle, e.g. `"fredwilson"` or `"Stocktwits"` (case-sensitive). Take it from `stocktwits/search` user results or the `user.username` field of any post. |
| `limit` | no (default `20`) | Max posts to return (1-100). The API serves 30 per page; the command pages internally. `partial=true` when the stream runs out first. |
| `filter` | no (default `top`) | `top` (默认/热门, the site's ranked view) | `bullish` (看涨, only Bullish-tagged posts) | `bearish` (看跌, only Bearish-tagged posts) | `all` (全部, newest). `latest` is NOT valid for user streams (HTTP 400). |

## Return Value

```json
{
  "user": {
    "id": 170,
    "username": "Stocktwits",
    "name": "Stocktwits",
    "avatarUrl": "https://avatars.stocktwits.com/...png",
    "joinDate": "2009-08-31",
    "official": true,
    "followers": 932824,
    "following": 10180,
    "ideas": 137457,
    "watchlistStocksCount": 200,
    "likeCount": 92653,
    "plusTier": "",
    "badges": [{ "type": "official", "showIcon": true }]
  },
  "pinnedMessage": {
    "id": 661002092,
    "url": "https://stocktwits.com/Stocktwits/message/661002092",
    "body": "Stocktoberfest 2026 ...",
    "createdAt": "2026-08-05T14:56:03Z",
    "sentiment": null,
    "likeCount": 12,
    "user": { "id": 170, "username": "Stocktwits", "name": "Stocktwits", "avatarUrl": "...", "followers": 932824, "ideas": 137457 },
    "symbols": []
  },
  "posts": [
    {
      "id": 662399253,
      "url": "https://stocktwits.com/Stocktwits/message/662399253",
      "body": "$SPY LOL",
      "createdAt": "2026-08-20T13:31:20Z",
      "sentiment": "Bullish",
      "likeCount": 1,
      "user": { "id": 170, "username": "Stocktwits", "name": "Stocktwits", "avatarUrl": "...", "followers": 932824, "ideas": 137457 },
      "symbols": ["SPY"]
    }
  ],
  "partial": false
}
```

Field notes:
- `posts[].url` is a **constructed** permalink (`https://stocktwits.com/{username}/message/{id}`) for display convenience — the API does not return a `url` field, and not every constructed URL is guaranteed to resolve (only `/discussions/{slug}/{id}` was verified reachable for poll/discussion messages).
- `posts[].likeCount` is a plain number from `message.likes.total`; profile-level `likeCount` is the plain `user.like_count` — the two are NOT the same source.
- `posts[].symbols` is an array of cashtag symbol strings (e.g. `["SPY"]`).
- `partial` is `true` when the user's stream runs out before `limit` posts were collected (or the account has no posts).
- Old posts (circa 2010) may lack `likes`/`symbols` — they default to `likeCount: 0`, `symbols: []`, `sentiment: null`.

## Usage

```
websculpt stocktwits get-user --username fredwilson
websculpt stocktwits get-user --username Stocktwits --limit 50
websculpt stocktwits get-user --username Stocktwits --filter bullish --limit 30
websculpt stocktwits get-user --username fredwilson --limit 100
```

## Common Error Codes

- `MISSING_PARAM` — `username` not provided / empty.
- `INVALID_PARAM` — `limit` is not a positive integer in 1-100, or `filter` is not `top`/`bullish`/`bearish`/`all` (e.g. `latest`).
- `NOT_FOUND` — the username does not exist (HTTP 404).
- `NETWORK_ERROR` — request failed at transport level after 3 backoff retries (the platform silently drops rapid new connections; the command retries automatically).
- `RATE_LIMITED` — HTTP 429/403 after 3 backoff retries; slow down and retry later.
- `API_ERROR` — unexpected HTTP status or a response missing `messages`/`user` (API drifted).
