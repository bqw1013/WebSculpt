# stocktwits/list-rankings

List one of Stocktwits' seven symbol ranking charts — the tabs on stocktwits.com/sentiment (榜单中心). Anonymous public JSON API, no login, no browser.

## Description

Fetches a ranked list of symbols for one of the seven /sentiment ranking tabs, with class filtering and internal pagination.

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `type` | no | `trending` | Which ranking. 七值枚举: `trending` 热议 (default) / `most-active` 最活跃 / `watchers` 最多关注 / `most-bullish` 最看多 / `most-bearish` 最看空 / `top-gainers` 涨幅榜 / `top-losers` 跌幅榜 |
| `class` | no | `all` | Instrument class. 三值枚举: `all` 全部 / `equities` 股票+ETF / `crypto` 加密货币. `stocks`/`etfs` are rejected (INVALID_PARAM) |
| `region` | no | `US` | Market region code. Passed through to the API's `regions` param; verified no-op (only US data exists) |
| `limit` | no | `20` | Max symbols to return (1-100; up to 1000 via internal pagination). 100 per API page; partial=true only when fewer than limit are returned (ranking exhausted) |

## Return Value

```json
{
  "type": "trending",
  "entries": [
    {
      "rank": 1,
      "symbol": "MRNA",
      "title": "Moderna Inc",
      "exchange": "NASDAQ",
      "region": "US",
      "sector": "HealthTechnology",
      "industry": "Biotechnology",
      "watchlistCount": 123456,
      "instrumentClass": "Stock",
      "trendingScore": 12.3456,
      "trendsSummary": "Example summary of recent community discussion.",
      "logoUrl": "https://logos.stocktwits-cdn.com/MRNA.png",
      "price": {
        "last": 123.45,
        "change": 1.23,
        "percentChange": 1.01,
        "open": 122.00,
        "high": 125.00,
        "low": 121.50,
        "volume": 1234567,
        "previousClose": 122.22
      },
      "fundamentals": {
        "name": "Moderna, Inc.",
        "businessDescription": "...",
        "industryName": "Biotechnology",
        "sectorName": "Health Technology"
      }
    }
  ],
  "partial": true
}
```

`price` and `fundamentals` are present only when the API returns them (the command always requests `payloads=qprices`).

## Usage

```bash
# Happy path — default trending ranking
websculpt stocktwits list-rankings

# A different ranking
websculpt stocktwits list-rankings --type top-gainers

# Filter to crypto only
websculpt stocktwits list-rankings --type trending --class crypto

# Small and large limits (100/page internally, paginates above 100)
websculpt stocktwits list-rankings --limit 1
websculpt stocktwits list-rankings --limit 100
```

## Common Error Codes

- `INVALID_PARAM` — invalid `type` (not one of the 7), invalid `class` (not all/equities/crypto), or non-positive/non-numeric `limit`.
- `RATE_LIMITED` — HTTP 429/403 from the API after retries (rare; polite pacing is built in).
- `NETWORK_ERROR` — connection dropped after retries.
- `API_ERROR` — unexpected HTTP status or response shape (possible endpoint drift).
- `NOT_FOUND` — ranking endpoint returned HTTP 404.
