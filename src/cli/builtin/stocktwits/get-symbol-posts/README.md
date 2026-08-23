# stocktwits/get-symbol-posts

## Description

Fetch the discussion post stream for one Stocktwits symbol — the feed on `stocktwits.com/symbol/{symbol}` for a stock (e.g. `AAPL`) or cryptocurrency (e.g. `BTC.X`). Returns the symbol summary plus each post's id, URL, body, timestamp, sentiment tag (Bullish/Bearish/null), like count, author info, and mentioned symbols.

`filter` picks the page's tabs: `top` (default — the site's ranked view), `all` (newest first), `bullish` (only Bullish-tagged posts), `bearish` (only Bearish-tagged posts). The command paginates internally (30 per API page via the `max` cursor) up to `--limit`; when the stream runs out first it returns fewer posts with `partial: true`.

Anonymous public API — no login, no API key, no browser. Runtime: `node`.

## Parameters

| name | required | default | description |
|------|----------|---------|-------------|
| `symbol` | yes | — | The cashtag without the `$`, e.g. `AAPL` (stock) or `BTC.X` (crypto). Invalid symbols raise `NOT_FOUND`. |
| `filter` | no | `top` | `top` (热门, default — the site's ranked tab) \| `all` (最新, newest first) \| `bullish` (看涨) \| `bearish` (看跌). **`latest` is not valid** — the API rejects it (HTTP 400); use `all` for newest. |
| `limit` | no | `20` | Max posts to return, 1-100. The API serves 30 per page; the command pages internally and sets `partial: true` when the stream is exhausted. |

## Return Value

```json
{
  "symbol": {
    "id": 686,
    "symbol": "AAPL",
    "title": "Apple Inc",
    "exchange": "NASDAQ",
    "region": "US",
    "watchlistCount": 989526,
    "logoUrl": "https://logos.stocktwits-cdn.com/AAPL.png",
    "instrumentClass": "Stock"
  },
  "messages": [
    {
      "id": 100000001,
      "url": "https://stocktwits.com/example_user/message/100000001",
      "body": "$AAPL example post body",
      "createdAt": "2026-08-20T13:39:47Z",
      "sentiment": null,
      "likeCount": 1,
      "user": {
        "id": 1000000,
        "username": "example_user",
        "name": "Example User",
        "avatarUrl": "https://avatars.stocktwits.com/...",
        "followers": 4,
        "ideas": 273
      },
      "symbols": [
        {
          "symbol": "AAPL",
          "title": "Apple Inc",
          "exchange": "NASDAQ",
          "logoUrl": "https://logos.stocktwits-cdn.com/AAPL.png",
          "watchlistCount": 989526
        }
      ]
    }
  ],
  "partial": false
}
```

Field notes:

- `symbol`: the symbol summary. `watchlistCount` is the number of watchers; `logoUrl` is the logo; `instrumentClass` is `"Stock"`, `"CRYPTO"`, etc.
- `messages[].sentiment`: `"Bullish"` | `"Bearish"` | `null`. `filter=bullish`/`bearish` returns posts that are 100% one tag (server-side filtering).
- `messages[].likeCount`: 0 when the API omits `likes` (the field is optional).
- `messages[].url`: constructed as `https://stocktwits.com/{username}/message/{id}` (the API message object has no URL field).
- `partial`: `true` only when the stream was exhausted before reaching `limit` (fewer posts available than requested).

## Usage

```
websculpt stocktwits get-symbol-posts --symbol AAPL
websculpt stocktwits get-symbol-posts --symbol AAPL --filter bullish
websculpt stocktwits get-symbol-posts --symbol AAPL --filter bearish --limit 5
websculpt stocktwits get-symbol-posts --symbol BTC.X
websculpt stocktwits get-symbol-posts --symbol AAPL --limit 100
```

## Common Error Codes

| code | meaning |
|------|---------|
| `MISSING_PARAM` | `--symbol` is required but missing/empty. |
| `INVALID_PARAM` | `filter` is not one of `top/all/bullish/bearish` (e.g. `latest`), or `limit` is not an integer in 1-100. |
| `NOT_FOUND` | The symbol does not exist (API returned HTTP 404 "Symbol not found"). |
| `RATE_LIMITED` | Stocktwits returned 403/429 repeatedly (rate limit) after 3 attempts. |
| `API_ERROR` | Unexpected HTTP status, non-JSON response, missing `messages`/`symbol`, or an API error body. |
| `NETWORK_ERROR` | Fetch failed / timed out / network unreachable after 3 attempts. |
