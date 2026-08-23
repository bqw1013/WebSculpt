# Context

## Precipitation Background (Why This Command Exists)

Stocktwits' /sentiment page (榜单中心) is the site's discovery surface: seven ranked symbol charts (trending 热议 / most-active 最活跃 / watchers 最多关注 / most-bullish 最看多 / most-bearish 最看空 / top-gainers 涨幅榜 / top-losers 跌幅榜). All seven are backed by the same anonymous public JSON API (`api.stocktwits.com/api/2/trending/*.json`), verified end-to-end during exploration (assessed passed 2026-08-20). This command exposes all seven rankings + class filtering + pagination in one node-runtime command. The platform has no rate-limit enforcement under sustained testing (zero 429/403 observed), but is Cloudflare-fronted, so polite pacing and backoff are kept.

## Value Assessment

- One command covers all seven ranking tabs with a single type enum; no browser/login/cookies needed.
- The rankings are the entry point for symbol discovery: returned `symbol` values feed `stocktwits/get-symbol-overview` and `stocktwits/get-symbol-posts`.
- Verified anonymous and stable; reusable for "what's hot / most-active / most-watched / most-bullish / bearish / biggest movers right now" queries.

## Page Structure

API base: `https://api.stocktwits.com/api/2/trending/{file}.json?class={class}&limit={limit}&page_num={n}&payloads=qprices&enable_price_v2=true` (Chrome UA). Response JSON: `{ cursor: {more, page_num, limit}, <arrayKey>: [...] }` — the array key differs per type and must be read by type (see command.js TYPES table).

Type → file → array key: trending→symbols_enhanced.json→`symbols`; most-active→most_active.json→`most_active`; watchers→top_watched.json→`top_watched`; most-bullish→most_bullish.json→`most_bullish`; most-bearish→most_bearish.json→`most_bearish`; top-gainers→top_gainers.json→`top_gainers`; top-losers→top_losers.json→`top_losers`.

Class filter: only `all`/`equities`/`crypto` are effective (matches the page's three MarketNavigation pills). `stocks`/`etfs` are silently ignored server-side → the command rejects them.

## Environment Dependencies

- Public API, anonymous. Chrome UA recommended; Cloudflare may set `__cf_bm` cookie on first response but does not challenge.
- Polite pacing: random 200-700ms sleep before each request + backoff retry (max 3) on 429/403/5xx/network errors.
- Pagination: page size = min(limit, 100); `page_num` increments; stop when `count==0 || !more`. Deep pages soft-end around 630-660 total items with HTTP 200 (NOT an error).
- `region` param is a verified no-op (page uses plural `regions`; both accepted; non-US values return US data unchanged). Command passes it through but does not promise filtering.
- `price_data` only appears when `payloads=qprices&enable_price_v2=true` is sent — always sent.

## Failure Signals

- Response missing the type-specific array key → structure drift → API_ERROR (message names the missing key).
- `count==0` on a page → soft end; loop must terminate (not an infinite loop), `partial=true`.
- partial semantics (library convention): `partial=true` ONLY when fewer than `limit` were returned (stream exhausted at ~630-660) or the pagination guard fired. Reaching `limit` normally (even with `cursor.more=true`) is `partial=false` — do not reintroduce a "cut off at limit" flag.
- HTTP 404 → endpoint removed → NOT_FOUND.
- HTTP 429/403 persistent → RATE_LIMITED (after retries).
- `--type bogus` / `--class stocks` → INVALID_PARAM (enum validation) — do NOT rely on the server to reject, it silently ignores class.
- Empty result set on page 1 (possible but rare) → returns `{entries: [], partial: true}`.

## Repair Clues

- If the API changes the array key or field names (e.g. `watchlist_count` → `watchlistCount`), update `mapEntry` and the `TYPES` table; the strict missing-key check in the main loop will surface the exact key name.
- If a new ranking tab is added to /sentiment, add its file/key to `TYPES` and extend the `type` enum in manifest/README/comments.
- If rate limiting starts appearing, raise the polite-delay range (currently 200-700ms) and/or reduce page size.
- Full API surface is documented in the command-family planning document (background) and the explore trace (authoritative evidence).
