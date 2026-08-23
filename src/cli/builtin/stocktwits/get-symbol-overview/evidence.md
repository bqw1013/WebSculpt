# Evidence: stocktwits/get-symbol-overview

This document records the research and validation evidence for the `stocktwits/get-symbol-overview` command.

## Exploration Path

- Explored on 2026-08-20 (`websculpt explore assess` → `status: passed`, `capture eligible: yes`).
- Command library overlap: `websculpt command list stocktwits` → none; no prior stocktwits command existed at explore time. This is a brand-new command (later a sibling `stocktwits/search` was added to the library by another capture — no name conflict, independent path).
- Tool contract consulted: node runtime contract (ESM default export, only Node built-ins, serializable return, `[CODE]` business errors).
- No browser, no login, no daemon attach. Path is anonymous SSR HTML via a single HTTP GET.
- Runtime re-verified during capture with a standalone Node script using `node:https` + `node:zlib`: AAPL (HTTP 200, gzip), BTC.X (308 → `/coins/bitcoin`, HTTP 200), lowercase `aapl` (HTTP 200, returns `AAPL`), bogus symbol `BOGUSXYZ` (HTTP 404, no `initialData` key).

## Verified URLs

- https://stocktwits.com/symbol/AAPL — HTTP 200; full SSR snapshot (quote, sentiment, poll, fundamentals, earningsFacts, 10 articles).
- https://stocktwits.com/symbol/NVDA — HTTP 200 (explore; same structure as AAPL).
- https://stocktwits.com/symbol/MSTR — HTTP 200; Bullish label 70 (explore).
- https://stocktwits.com/symbol/CRBU — HTTP 200; small-cap, fundamentals present (explore).
- https://stocktwits.com/symbol/HROW — HTTP 200; small-cap (explore).
- https://stocktwits.com/symbol/PAYO — HTTP 200; small-cap, trendingScore 0 (explore).
- https://stocktwits.com/symbol/BTC.X — HTTP 308 redirect to https://stocktwits.com/coins/bitcoin (followed); final HTTP 200; `initialData.symbol` still `BTC.X`, `instrumentClass` CRYPTO, aiContent 2 entries, sentiment 83 "Extremely Bullish Sentiment".
- https://stocktwits.com/coins/ethereum — HTTP 200 (explore).
- https://stocktwits.com/symbol/BOGUSXYZ — HTTP 404; `pageProps` has no `initialData` key (NOT_FOUND detection confirmed).
- https://stocktwits.com/symbol/aapl — HTTP 200; server normalizes to `AAPL` (case-insensitive symbol).

## Structural Evidence

Data source: SSR HTML at `/symbol/{symbol}` embeds `<script id="__NEXT_DATA__" type="application/json">`. Extraction: regex `/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/`, then `JSON.parse(...).props.pageProps.initialData`. `dehydratedState` holds only homepage trending data — ignore. The public streams API (`api.stocktwits.com/api/2/symbols/{symbol}.json`) returns 404 and is not an alternative.

Top-level `initialData` fields (AAPL verified):
- Meta: `symbol` (string, e.g. "AAPL"), `symbolMic` ("NVDA.XNAS"), `symbolDisplay`, `title`, `exchange` ("NASDAQ"/"CRYPTO"), `region` ("US"), `logoUrl`, `sector` ("ElectronicTechnology"), `industry` ("Semiconductors"), `instrumentClass` ("Stock"/"CRYPTO"), `watchlistCount` (number), `trendingScore` (number, can be negative), `trending` (bool), `cusip`, `isin`, `tradeStatus`.
- `price_data`: `symbol, timestamp, quote_type, open, high, low, last, previous_close, previous_close_date, change, percent_change, volume, last_size, combined, time_location, currency_code, currency_symbol, futures_symbols`. Crypto price_data is slimmer: only `last, change, percent_change, combined` (no OHLC/volume/prev_close — must default to null). Live/intraday price is expressed by `combined = {is_valid, price, change, percent_change, timestamp}`; there is NO `extended_hours` field anywhere.
- `quote`: same key set as `price_data`, slightly different timestamp/values — `price_data` is authoritative.
- `initialBullBearVoteData`: `{score: 0-100, title}` — server-provided label. Observed: 82/83 "Extremely Bullish Sentiment" (BTC.X), 70 "Bullish Sentiment" (MSTR), 47/54/46 "Neutral Sentiment", 29 "Bearish Sentiment".
- `initialSentimentCardData`: `{messageVol: [{label,value}], sentiment: [{label,value}]}` — current vs previous day, two entries each.
- `aiContent`: array of `{type, data:{summary}, createdAt}`. Non-empty ONLY for crypto (BTC.X: trending_summary_v1 + price_moving_summary_v1). All stock symbols tested returned `[]`.
- `poll`: `{id, question, status, totalVotes, sponsored, startsAt, expiresAt, choices:[{title,percent,selected}], winningChoice, discussion:{...}}`. SITE-WIDE daily rotating poll, not symbol-specific (same poll id for all stock pages on a given day).
- `fundamentals`: flat snake_case object (41 keys for AAPL) including `name, business_description, industry_name, sector_name, instrument_class, fiscal_period_end_date, market_capitalization, eps, pe_ratio, price_to_book, shares_outstanding, dividend_yield_security, dividend_rate, dividend_payout_ratio, total_enterprise_value, beta, fifty_day_moving_average, high/low_price_last_52_weeks, average_daily_volume_last_month, float_current, total_assets, total_debt, total_cash, total_liabilities, total_expenses, earnings_growth, gross_income_margin, number_of_employees, shares_held_by_institutions`.
- `earningsFacts`: `{ePS (note capital PS), earningsCall, nextEarningsCall, sales, symbol, upcomingLatestData}`; EPS items have `{actual, estimated, dollarDiff, fiscalPeriod, fiscalYear, formattedActual/Estimate/Period, result: "BEAT"|"MISS", surprise}`.
- `articles`: 10 news items `{headline, canonical_url (EMPTY for Stocktwits-hosted, full URL for syndicated like Benzinga/ZeroHedge), summary, created_at, source:{source_name,url_domain}, sid, url_slug, image_url, type, symbols}`. Verified `/news/{slug}` and `/news-articles/{slug}` both 404 → do NOT synthesize a URL from url_slug; news.url = canonical_url or null.
- `dailySentiment`: always null across all 6 explored symbols — ignored (real sentiment lives in initialBullBearVoteData / initialSentimentCardData).
- `highlightArticle`: present but not part of the command output.

Transport facts: Cloudflare front; response headers `Server: cloudflare` + `CF-RAY`, no `x-ratelimit`/`retry-after` headers. `Accept-Encoding: gzip` returns gzip body (decompress with `zlib.createGunzip()`); handle deflate and br as well. Crypto symbols redirect 308 to `/coins/{slug}` — must follow redirects (fetch/https loop up to 5 hops).

## Failure Signals

- `HTTP 404` on `/symbol/{symbol}` OR `pageProps.initialData` missing / `initialData.symbol` not a non-empty string → `NOT_FOUND` (bogus symbol; verified BOGUSXYZ).
- Missing `<script id="__NEXT_DATA__">` or unparseable JSON → `API_ERROR` (page structure drifted; re-explore).
- `429`/`403` → `RATE_LIMITED` after 3 attempts with exponential backoff (explore stress test saw no 429/403 across 40+ consecutive requests, but the guard stays).
- Connection error / TLS / timeout → `NETWORK_ERROR` after 3 attempts.
- `__NEXT_DATA__` content can contain the literal substring `</script>` inside JSON strings — always use non-greedy match to the FIRST closing tag (verified safe on current payloads).
- Cloudflare jsdelivr challenge loader (`/cdn-cgi/challenge-platform/scripts/jsd/main.js`) is a benign baseline, NOT a block page; it appears in the first successful fetch.

## Capture Assessment

Capture `stocktwits/get-symbol-overview` as a node-runtime command. The Stocktwits symbol page exposes a rich SSR-only snapshot (live quote via `combined`, bull/bear sentiment score + labels, daily community poll, fundamentals, earnings facts, related news) that the public streams API cannot provide. The path is a single anonymous GET + `__NEXT_DATA__` extraction — simple, cheap, repeatable, no browser/login. High reuse value for market-sentiment snapshots. Contract confirmed; capture should proceed.
