# Evidence: stocktwits/list-rankings

This document records the research and validation evidence for the `stocktwits/list-rankings` command.

## Exploration Path

Exploration was done via the `websculpt-explore` skill and assessed `status: passed` on 2026-08-20. The path was verified by direct curl against the public Stocktwits JSON API with a Chrome user-agent; no browser, no login, no cookie dependency. Command library was checked first: at explore time there were no stocktwits commands (all new); by capture time `stocktwits/search` exists in the library but is a different domain/action — no modification of other commands needed. This is a `node` runtime command; the node runtime contract was read before writing `command.js`.

## Verified URLs

- https://api.stocktwits.com/api/2/trending/symbols_enhanced.json?class=all&limit=100&page_num=1&payloads=qprices&enable_price_v2=true (HTTP 200; array key `symbols`)
- https://api.stocktwits.com/api/2/trending/most_active.json?class=all&limit=3&page_num=1 (HTTP 200; array key `most_active`)
- https://api.stocktwits.com/api/2/trending/top_watched.json?class=all&limit=3&page_num=1 (HTTP 200; array key `top_watched`)
- https://api.stocktwits.com/api/2/trending/most_bullish.json?class=all&limit=3&page_num=1 (HTTP 200; array key `most_bullish`)
- https://api.stocktwits.com/api/2/trending/most_bearish.json?class=all&limit=3&page_num=1 (HTTP 200; array key `most_bearish`)
- https://api.stocktwits.com/api/2/trending/top_gainers.json?class=all&limit=3&page_num=1 (HTTP 200; array key `top_gainers`)
- https://api.stocktwits.com/api/2/trending/top_losers.json?class=all&limit=3&page_num=1 (HTTP 200; array key `top_losers`)
- https://stocktwits.com/sentiment (SSR: MarketsNavigation pills are exactly `all` / `equities` / `crypto`; client queryKey `useFetchTrendingEnhancedQueryKey {"class":"all","limit":10,"payloads":"indices,prices","regions":"US"}`)

## Structural Evidence

Base endpoint pattern (verified for all 7 types): `GET https://api.stocktwits.com/api/2/trending/{file}.json?class={class}&limit={limit}&page_num={page_num}&payloads=qprices&enable_price_v2=true`. Chrome UA recommended. Response is JSON with `cursor` `{more, page_num, limit}` and a type-specific array key.

Type → file → array key mapping (keys differ per type; must be read by type):

| type | file | array key |
|---|---|---|
| trending (default, 热议) | `symbols_enhanced.json` | `symbols` |
| most-active (最活跃) | `most_active.json` | `most_active` |
| watchers (最多关注) | `top_watched.json` | `top_watched` |
| most-bullish (最看多) | `most_bullish.json` | `most_bullish` |
| most-bearish (最看空) | `most_bearish.json` | `most_bearish` |
| top-gainers (涨幅榜) | `top_gainers.json` | `top_gainers` |
| top-losers (跌幅榜) | `top_losers.json` | `top_losers` |

`class` filter — only three values are effective: `all` (全部) / `equities` (股票+ETF) / `crypto` (加密货币). `stocks` and `etfs` are silently ignored by the API (response bytes identical to `class=all`, confirmed identical via cmp). `class=equities` returns only US-listed stocks/ETFs (region=US, NASDAQ/NYSE/NYSEArca); `class=crypto` returns only crypto (region=X, exchange=CRYPTO, symbols like BTC.X/XRP.X/ETH.X). These three values match the /sentiment page pills exactly. The command therefore rejects `stocks`/`etfs` with INVALID_PARAM rather than silently returning unfiltered data.

`limit`: 1→1 item; 100→100 items (per-page max); 101/1000→still 100 (silently truncated); 0→treated as 1. Page size is capped at 100; the command clamps limit to [1,100] per page and paginates via `page_num` increments.

Pagination: `page_num` increments per page (page1/page2/page3/page5 all return different items, `cursor.more=true`). Deep-pagination soft limit: with limit=30, page21 still returns 30 items, from page23 the API returns `HTTP 200 count=0 more=false`; with limit=100 the same happens from page50. Total reachable set is ~630-660 items. The command stops when `count==0 || !more` and sets `partial=true`.

`region`: the page uses `regions` (plural); both `regions` and `region` are accepted and return HTTP 200, but the parameter is a no-op — `regions=CN/UK/DE` return byte-identical US data (30 items all region=US under class=equities). The command passes it through and records it, but does not promise filtering.

Enhanced fields: without `payloads` the symbol objects have no `price_data`; with `payloads=qprices&enable_price_v2=true`, `price_data` appears on all 7 endpoints. `rank`, `trending_score` and `fundamentals` (business_description, industry_name, sector_name, name) are present by default.

Sample symbol object (`symbols_enhanced.json?class=all&limit=3&page_num=1&payloads=qprices&enable_price_v2=true`, symbols[1]): `{id, symbol: "MRNA", title: "Moderna Inc", exchange: "NASDAQ", region: "US", logo_url, watchlist_count: 114474, instrument_class: "Stock", sector: "HealthTechnology", industry: "Biotechnology", rank: 2, trending_score: 17.9647, trends: {all: 2, summary: "..."}, price_data: {symbol, timestamp, quote_type, open, high, low, last, previous_close, change, percent_change, volume, combined: {is_valid, price, change, percent_change}, time_location, currency_code, currency_symbol}, fundamentals: {symbol, timestamp, name: "Moderna, Inc.", business_description, industry_name, sector_name, instrument_class, fiscal_period_end_date}}`.

Rate limiting: zero 429/403 across sustained testing in this exploration; no `rate-limit`/`x-ratelimit` response headers; fronted by Cloudflare (`Server: cloudflare`, `cf-cache-status: DYNAMIC`, first response sets `__cf_bm` cookie) but not challenged. Response time 0.7-2.8s. Implementation uses a polite random 200-700ms delay between requests plus 429/403/connection-error backoff retry (max 3).

## Failure Signals

- Invalid `class` value (`stocks`, `etfs`, or any other) is silently ignored server-side — command must validate against the 3-value enum and throw INVALID_PARAM, else the user gets an unfiltered set and believes a filter applied.
- Invalid `type` value → server returns a non-200 or non-JSON / no matching array key. Command must validate the 7-value enum first (INVALID_PARAM) and additionally guard against a missing array key (fallback to empty list → partial).
- Deep pagination soft end: `page_num` beyond ~23 (limit=30) or ~50 (limit=100) returns `count=0, more=false` with HTTP 200 — NOT an error. Loop must terminate on `count==0 || !more`, otherwise it would spin forever.
- `price_data` is absent unless `payloads=qprices&enable_price_v2=true` is sent; consumers relying on price fields get undefined otherwise. The command always sends payloads.
- `limit` above 100 is silently truncated to 100 per page; command clamps and paginates internally so the requested total is still honoured.
- Network/CF behavior: a dropped connection (fetch throws) or HTTP 429/403 should retry with backoff (up to 3 attempts), then NETWORK_ERROR/RATE_LIMITED. A successful HTTP 200 with an unexpected body shape (missing cursor/array) should be treated as API_ERROR/DRIFT.
- `region` is a no-op: no error, no empty result, no filtering for non-US values. Do not promise filtering in the output or error when a non-US region is passed.

## Capture Assessment

This command should be captured: it is the core discovery surface of the /sentiment page (7 ranking tabs), fully verified over the public JSON API with no browser/login requirement, and it feeds symbols into get-symbol-overview / get-symbol-posts. The path is stable, anonymous, and the platform shows no rate-limit enforcement under sustained testing, so a `node` runtime command with polite pacing and backoff is appropriate. All contract items (type 7-value enum, class 3-value enum, region no-op, limit/pagination semantics, partial flag, output schema) were reviewed and explicitly confirmed on 2026-08-20.
