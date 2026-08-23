# Context

## Precipitation Background (Why This Command Exists)

Stocktwits had zero commands. The per-symbol discussion stream is the platform's core content shape and the landing point for symbols produced by `stocktwits/search` / `stocktwits/list-rankings` / the `symbols` field of any post. Exploration on 2026-08-20 (assess `passed`) verified the anonymous API and corrected the original plan on three points: **`filter=latest` is rejected with HTTP 400** (the newest view is `all`), the API `message` object has **no `url` field** (constructed as `https://stocktwits.com/{username}/message/{id}`), and the `symbol` object has **no `sector` field** (dropped from output).

## Value Assessment

Reusable for "what are people posting about symbol X right now", bull/bear sentiment scanning, and as the upstream for `get-post` (message ids). Stocktwits' streams API is anonymous and measured rate-limit-free (42 consecutive requests, 0 blocks), so the command is cheap and stable. The `max`-cursor pagination pattern is shared with the planned `get-feed` / `get-user` commands.

## Page Structure

- Endpoint: `https://api.stocktwits.com/api/2/streams/symbol/{symbol}.json?filter={filter}&limit={30}&max={cursor}` with a Chrome User-Agent. Anonymous, HTTP 200, ~93-130KB/page.
- Top-level: `{"symbol":{...}, "cursor":{"more":bool,"since":id,"max":id}, "regions":[], "filters":[...], "messages":[...], "response":{"status":200}}`. `filters` echoes the applied filter.
- `symbol` keys: `id, symbol, symbol_mic, symbol_display, exchange, region, logo_url, title, aliases, deeplink, external_id, is_following, watchlist_count, has_pricing, instrument_class, live_event, trade_status` — **no `sector`**.
- `message` keys: `id, body, tokenized_body, created_at, discussion, source, prices, mentioned_users, entities, user, symbols` — **no `url`**. `likes` optional (`{"total":1,"user_ids":[...]}`; total=0 usually omitted). `entities.sentiment.basic` = `"Bullish"|"Bearish"|null`. `user` has `id, username, name, avatar_url, join_date, followers, following, ideas, like_count, plus_tier, official, badges`. `symbols[]` has `symbol, symbol_display, title, exchange, region, logo_url, watchlist_count, sentiment_change, volume_change`.
- Pagination: per-page cap 30 (limit 31/100 silently truncated to 30). `cursor.max` == last message id of the page; pass it as `&max=`. Terminal state `cursor.more=false`. `since` cursor (newer-than) also valid.
- The website frontend calls this same endpoint from `/symbol/AAPL` (browser and curl are same-source).

## Environment Dependencies

- No login, no API key, no browser. Anonymous HTTP with a Chrome User-Agent.
- Polite pacing: random 200-700ms sleep before every request. Stocktwits measured unlimited (42 requests, 0 429/403/captcha, no `ratelimit-*` headers, no soft degradation), but the sleep keeps the command conservative. Cloudflare serves the API (`cf-cache-status: DYNAMIC`, `__cf_bm` cookie) but never challenges anonymous browsers.
- Node runtime: uses global `fetch` + `AbortController` (Node 18+). No third-party modules.

## Failure Signals

- Invalid symbol → HTTP 404 `{"errors":[{"message":"Symbol not found"}]}` → `NOT_FOUND`.
- `filter=latest` → HTTP 400 (`latest contains an invalid filter: latest`) — the command rejects it client-side as `INVALID_PARAM`. Enum is exactly `top | all | bullish | bearish`.
- A 200 response that is not valid JSON, or missing the `messages` array / first-page `symbol` object → `API_ERROR` (structure drift).
- `403`/`429` after 3 backoff retries → `RATE_LIMITED`. Connection error / timeout after 3 retries → `NETWORK_ERROR`. Other unexpected status → `API_ERROR`.
- The pagination loop guards against a non-advancing cursor (repeated first id) and empty pages to avoid infinite loops.

## Repair Clues

- If Stocktwits changes the stream schema, re-derive the field map from a fresh `curl` of the endpoint (snake_case → camelCase mapping lives in `mapSymbol`/`mapMessage`).
- If a new `filter` value appears, add it to the `FILTERS` array + the manifest/README descriptions. If `latest` ever becomes valid, re-test before removing the `all` guidance.
- If rate limiting starts appearing, verify with a burst test like the explore trace did (24 direct + 18 paginated requests) before weakening the backoff.
- The constructed message `url` (`https://stocktwits.com/{username}/message/{id}`) should be spot-checked periodically — it returns HTTP 200 today but depends on the site keeping the message permalink route.
