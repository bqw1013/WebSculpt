# Evidence: stocktwits/get-feed

This document records the research and validation evidence for the `stocktwits/get-feed` command.

## Exploration Path

Command library overlap check: `websculpt command list stocktwits` → "No commands available" at explore time (the `stocktwits/search` command was installed later by a sibling capture; `get-feed` does not conflict with it). The library snapshot taken at `capture new` reported `sameDomainCommands: [stocktwits/search]` and `nameConflict: false`.

Guide consulted: the capture skill and its node runtime contract. The exploration itself used plain curl / node https against the public StockTwits JSON API with a Chrome/131 user agent and random 200-700ms sleep before each request. No browser, no login, no cookie was used anywhere in the verified path.

Exploration was assessed (`status: passed`) on 2026-08-20; the contract was confirmed.

## Verified URLs

- https://api.stocktwits.com/api/2/streams/trending.json — site-wide trending feed endpoint. Anonymous GET returns HTTP 200 `application/json`. No auth/cookie required; Cloudflare only sets `__cf_bm`/`_cfuvid` (non-mandatory).
- https://api.stocktwits.com/api/2/streams/trending.json?limit=30 — single-page fetch returns 30 messages.
- https://api.stocktwits.com/api/2/streams/trending.json?limit=30&max=662401312 — pagination via the `max` cursor (`cursor.max` of the previous page) returns the next, older page.
- https://api.stocktwits.com/api/2/streams/trending.json?filter=bullish&limit=30 — optional `filter` accepted (out of scope; contract exposes only `limit`).
- https://api.stocktwits.com/api/2/streams/symbol/AAPL.json?limit=3 — used to cross-check that the `message` field shape is identical to the trending stream (confirmed key-by-key).
- https://stocktwits.com/ — anonymous homepage HTML (`hasToken=false`). The message feed is NOT in the SSR; the web front-end loads it client-side from the same `streams/trending.json` endpoint the command uses.
- Permalink format probes (web): `https://stocktwits.com/{username}/message/{id}` → 200 (case-insensitive); `https://stocktwits.com/{id}`, `https://stocktwits.com/messages/{id}`, `https://stocktwits.com/symbol/{sym}/{id}`, `https://stocktwits.com/{user_id}/message/{id}` → all 404.

## Structural Evidence

Response envelope of `streams/trending.json`:

```
{
  "cursor": {"more": true, "since": <int newest id>, "max": <int oldest id>},
  "regions": [],
  "filters": [],
  "messages": [ ... ],
  "response": {"status": 200}
}
```

- `cursor.since` = newest message id on the page, `cursor.max` = oldest message id on the page. Paginate with `?max=<cursor.max>` to fetch older messages. `cursor.more === false` means the stream is exhausted.
- Pagination verified over 3 consecutive pages (limit=30): ids strictly monotonic decreasing, no overlap, no in-page duplicates (`new Set` de-dupe check passed). `pageN.last > page(N+1).first` always holds.

Message field list (identical between trending and symbol streams, verified key-by-key):
`id` (number, globally monotonic = time order), `body` (plain text), `tokenized_body`, `created_at` (ISO 8601 UTC), `discussion` (bool), `source {id,title,url}`, `prices [{id,symbol,symbol_mic,price}]`, `mentioned_users`, `entities {media, sentiment: {basic: "Bullish"|"Bearish"}|null, discussable}`, `user {id, username, name, avatar_url_ssl, join_date, official, identity, followers, following, ideas, watchlist_stocks_count, like_count, plus_tier, trade_status, ...}`, `symbols [{id, symbol, symbol_display, exchange, region, title, logo_url, watchlist_count, instrument_class, sentiment_change, volume_change, ...}]`.

Conditional fields:
- `likes` only present when `total > 0`; value `{total, user_ids[]}`. Command maps it to `likeCount` with fallback 0.
- `reshare_message` only on reshared posts (not used by this command).
- `entities.sentiment.basic` = `"Bullish"` | `"Bearish"` | `null` (no tag); `null` is the common case.

Real captured sample (message id 662402175):
```json
{
  "id": 662402175,
  "body": "$SPY ha ha Where da Crash?",
  "created_at": "2026-08-20T13:44:28Z",
  "entities": { "sentiment": null },
  "likes": { "total": 1, "user_ids": [1523447] },
  "user": { "id": 4313722, "username": "MadMoneyScalper", "name": "Willie Wonka",
            "followers": 62, "following": 19, "ideas": 4483, "like_count": 5163,
            "plus_tier": "", "official": false },
  "symbols": [ { "id": 7271, "symbol": "SPY", "symbol_display": "SPY", "exchange": "NYSEArca",
                 "region": "US", "title": "SPDR S&P 500 ETF Trust", "watchlist_count": 636273,
                 "instrument_class": "ExchangeTradedFund" } ],
  "source": { "id": 1149, "title": "StockTwits for iOS" },
  "prices": [ { "id": 7271, "symbol": "SPY", "symbol_mic": "SPY.ARCX", "price": "767.59" } ]
}
```

Limit behavior (measured):
- limit=30 → 200, 30 messages
- limit=31/50/100/200 → 200, still 30 messages (single page silently capped at 30)
- limit=22 → 200, 22 messages
- limit=0 / -1 / abc → 200, 1 message (invalid/zero fall back to 1, no error)

Conclusion: the API serves at most 30 per page and never errors on over-limit; the command pages at 30/page internally and truncates to the external `--limit` (1-100).

Rate-limit reality (measured at explore time): 90 rapid consecutive calls + 10 deep-cursor calls all returned HTTP 200, full 30-message bodies, no soft degradation, no `x-ratelimit-*`/`retry-after` headers, zero 429/403/verification pages. The anonymous endpoint is effectively not hard-rate-limited, but the command keeps a polite random 200-700ms interval per request plus a 429/403/network backoff retry as a safety net.

## Failure Signals

- Non-200 HTTP (429/403): challenge/rate-limit — command retries with backoff (max 3 attempts), then throws `RATE_LIMITED`.
- Network/connection error (fetch throws): `NETWORK_ERROR` after retries.
- HTTP 5xx or malformed body: `API_ERROR` / `DRIFT_DETECTED`.
- Response envelope missing `messages` array or `cursor`: structure drift → `DRIFT_DETECTED`.
- `cursor.more === false` while fewer posts than requested were collected → the stream is exhausted → `partial=true` (successful, not an error).
- No hard failure for `likes` missing (fallback 0), `entities.sentiment` missing (fallback null), `user` subfields missing (fallback null/0), `symbols` missing (fallback empty array) — these are common conditionals, not drift.

## Capture Assessment

This command should be captured. It is the anonymous homepage feed — a high-frequency, high-value "what is the whole market talking about right now" view, one of the core StockTwits content surfaces. The path is fully verified (endpoint, pagination, limit semantics, permalink format, rate-limit reality) and needs no browser or login, so a `node` runtime command is cheap to run and reliable. It joins the StockTwits command family (search already installed; symbol-posts / symbol-overview / list-rankings in the plan) and shares the same cursor-pagination pattern, so future siblings can reuse the approach. Out of scope by contract: personalized logged-in feed (personal domain) and the optional `filter` parameter.
