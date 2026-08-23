# stocktwits/search

Search Stocktwits for symbols and users by keyword — the equivalent of the site's top search box.

## Description

ENTITY search only: finds tickers (stocks/crypto — symbol, company name, exchange, optional watchlist count and country) and user accounts (username, display name, avatar, official/premium/verified flags). It does NOT search posts by content — the platform has no post search. The public endpoint returns a fixed ~15 results for multi-character keywords, and the API ignores `limit`/`page`/`type`/`filter`, so the command exposes none of those parameters and does not paginate. Anonymous public API — no login, no browser needed.

## Parameters

- `query` (required) — search keyword: a ticker fragment, company name, or username, e.g. `AAPL`, `Tesla`, `fredwilson`.

## Return Value

Returns `{ query, symbols, users }`:

- `symbols`: `[{ id, symbol, title, exchange, watchlistCount?, country? }]` — `watchlistCount`/`country` are present only when the API includes them (primary ticker entries often omit them).
- `users`: `[{ id, username, name, avatarUrl, official, premium, verified, companyRepresentative? }]`.

No-hit keywords return empty `symbols`/`users` arrays (the API answers HTTP 200 with an empty result), not an error.

## Usage

```text
websculpt stocktwits search --query AAPL
websculpt stocktwits search --query Tesla
websculpt stocktwits search --query fredwilson
```

Feed the returned `symbol`/`username` values into `stocktwits/get-symbol-posts`, `stocktwits/get-symbol-overview`, or `stocktwits/get-user` for details.

## Common Error Codes

- `MISSING_PARAM`: `--query` is missing or empty
- `RATE_LIMITED`: HTTP 429/403 persisted across retries
- `API_ERROR`: non-2xx status (other than retried 429/403/5xx) or malformed response
- `NETWORK_ERROR`: connection dropped or request timed out across retries
