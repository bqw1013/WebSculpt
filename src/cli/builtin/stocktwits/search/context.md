# Context

## Precipitation Background (Why This Command Exists)

Captured 2026-08-20 (contract confirmed in exploration). Stocktwits is a US-stock/crypto community; the site's top search box is the discovery entry point. This command reproduces it as the entity-search front door for the stocktwits family — get-symbol-posts / get-symbol-overview / get-user consume the `symbol` / `username` values produced here.

## Value Assessment

Single stable anonymous public endpoint, one request per query, no login/browser/pagination. Reused whenever a caller must resolve a keyword to a ticker or username before fetching symbol/user details. Saves re-exploration of the search box path.

## Page Structure

- Endpoint: `GET https://api.stocktwits.com/api/2/search.json?q={query}` (UA=Chrome works).
- Envelope: `{"results": [...], "response": {"status": 200}}` — flat array, no pagination/cursor/total.
- `results[]` records carry a `type` discriminator:
  - `"symbol"`: `type,id,title,symbol,exchange` + optional `weight_offset`/`watchlist_count`/`country`. Primary entries often lack `watchlist_count`/`country` — read defensively. Crypto variants (symbol ends `.X`) carry `weight_offset` and empty-string `country`.
  - `"user"`: `id,type,username,name,avatar_url,official,premium,verified` + optional `company_representative`.
- NO `logo_url` in search results (full scan, 0 hits).

## Environment Dependencies

- Node runtime; anonymous public API — no login, no browser, no cookies.
- Polite pacing: random 200-700ms sleep before each request; 429/403/connection errors retried with backoff (max 3 attempts).
- No rate-limit response headers observed; ~50 rapid requests triggered no throttling (soft-degradation never observed).

## Failure Signals

- Non-2xx status (beyond retries) or non-JSON body → `API_ERROR`.
- Persistent 429/403 → `RATE_LIMITED`.
- Connection drop / 15s timeout across retries → `NETWORK_ERROR`.
- Missing/empty `query` → `MISSING_PARAM`.
- No-hit keyword → HTTP 200 empty `results` array → empty `symbols`/`users` (NOT an error).

## Repair Clues

- If the search UI stops working, re-verify `search.json?q=` shape. A heavier grouped endpoint (`search/v2/grouped_search.json`) was used by an earlier superseded browser command — a possible fallback if the simple endpoint drifts.
- `logo_url` is NOT present in search results; if a caller needs a logo, fetch `streams/symbol/{symbol}.json` separately (out of scope for this single-request command).
