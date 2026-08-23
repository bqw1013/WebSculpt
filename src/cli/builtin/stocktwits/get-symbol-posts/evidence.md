# Evidence: stocktwits/get-symbol-posts

This document records the research and validation evidence for the `stocktwits/get-symbol-posts` command.

## Exploration Path

- Exploration workspace passed audit (`explore assess` → `status: passed`, candidate `stocktwits/get-symbol-posts`, Confirmation recorded 2026-08-20).
- The explore trace corrected the original plan on three points: (1) `filter=latest` is **rejected with HTTP 400** — the "newest" view is `filter=all`; (2) the API `message` object has **no `url` field** — the output `url` is **constructed** as `https://stocktwits.com/{username}/message/{id}`; (3) the `symbol` object has **no `sector` field** — the output drops it.
- Command library check at exploration time: `websculpt command list stocktwits` → `No commands available.` (the library had zero stocktwits commands). A sibling `stocktwits/search` capture started later is a different action — no name conflict, no reuse.
- No browser automation: every fetch was an anonymous HTTP 200 via curl + node with a Chrome User-Agent. The site's own `/symbol/AAPL` page issues the identical `api.stocktwits.com/api/2/streams/symbol/AAPL.json` request — curl and browser data are same-source. No login, no JS challenge, no API signature. Runtime fixed as `node`.

## Verified URLs

- https://api.stocktwits.com/api/2/streams/symbol/AAPL.json — symbol discussion stream (HTTP 200, ~93-130KB/page). `filter=top` (filters echo `["top"]`), `filter=all` (filters `[]`, newest order), `filter=bullish` (30/30 Bullish-tagged), `filter=bearish` (30/30 Bearish-tagged) all verified.
- https://api.stocktwits.com/api/2/streams/symbol/AAPL.json?filter=all&limit=30&max=662394590 — `max` cursor pagination (page 2, 30 messages, ids 662394571→662378163; three consecutive pages had zero id overlap and strictly decreasing timestamps).
- https://api.stocktwits.com/api/2/streams/symbol/BTC.X.json — crypto symbol (HTTP 200, `{id:11418, symbol:"BTC.X", title:"Bitcoin", exchange:"CRYPTO", region:"X", instrument_class:"CRYPTO", watchlist_count:676137}`).
- https://api.stocktwits.com/api/2/streams/symbol/ZZZZNONEXISTENT.json — invalid symbol → HTTP 404 `{"errors":[{"message":"Symbol not found"}],"response":{"status":404}}`.
- https://api.stocktwits.com/api/2/streams/symbol/AAPL.json?filter=all&limit=10&since=662402000 — `since` cursor (newer-than) also valid.
- https://api.stocktwits.com/api/2/messages/show/662401099.json — single-message endpoint; corroborates that a message object carries **no `url`/`deeplink` field**.
- https://stocktwits.com/symbol/AAPL — symbol page HTML (same-source evidence: the page's only stream data request is the streams API above).
- https://stocktwits.com/{username}/message/{id} — constructed message permalink pattern verified HTTP 200 (the source of the output `url` field).

## Structural Evidence

- Top-level response shape: `{"symbol":{...}, "cursor":{"more":bool,"since":id,"max":id}, "regions":[], "filters":[...], "messages":[...], "response":{"status":200}}`. `filters` echoes the applied filter and can be used to assert the filter took effect.
- `symbol` object keys (measured, complete): `id, symbol, symbol_mic, symbol_display, exchange, region, logo_url, title, aliases, deeplink, external_id, is_following, watchlist_count, has_pricing, instrument_class, live_event, trade_status`. **No `sector` field.**
- `message` object keys (measured, complete): `id, body, tokenized_body, created_at, discussion, source, prices, mentioned_users, entities, user, symbols`. **No `url`/`deeplink` field** — the output `url` is constructed as `https://stocktwits.com/{username}/message/{id}`.
- `likes` is **optional**: present on 13/30 sample messages as `{"total":1,"user_ids":[...]}`; when `total` is 0 it is usually omitted → the command defaults a missing `likes` to `likeCount: 0`.
- `entities.sentiment.basic` = `"Bullish"` | `"Bearish"` | `null` (the `sentiment` object may itself be `null`). `filter=bullish` returns 30/30 Bullish and `filter=bearish` 30/30 Bearish — filtering is strictly enforced server-side, not client-side.
- `user` object keys: `id, username, name, avatar_url, join_date, followers, following, ideas, like_count, plus_tier, official, badges`.
- `symbols[]` (mentioned symbols per message): `symbol, symbol_display, title, exchange, region, logo_url, watchlist_count, sentiment_change, volume_change`.
- Pagination: the API caps `limit` at **30 per page** (limit=1→1, 5→5, 30→30, 31→30, 100→30 — silently truncated, no error). Page turn uses `cursor.max` (the last message id of the page) as `&max=`. Terminal state is `cursor.more=false` (confirmed via a `since` test page). The `since` cursor (newer-than) is also valid.
- Field mapping for output: `created_at→createdAt`, `watchlist_count→watchlistCount`, `logo_url→logoUrl`, `instrument_class→instrumentClass`, `likes.total→likeCount`, `avatar_url→avatarUrl`, `entities.sentiment.basic→sentiment`.

## Failure Signals

- Invalid symbol → HTTP 404 with `{"errors":[{"message":"Symbol not found"}]}` → the command raises `NOT_FOUND`.
- Invalid filter `latest` → HTTP 400 `{"errors":[{"message":"latest contains an invalid filter: latest"}]}` → the command rejects it client-side as `INVALID_PARAM` and never sends it. The enum is exactly `top | all | bullish | bearish`.
- Rate limiting: **measured unlimited** — 42 consecutive anonymous requests (24 direct burst + 18 paginated across 6 rounds of 3 pages) all HTTP 200, 0 × 429/403/captcha, no `ratelimit-*`/`x-ratelimit-*` response headers, no soft degradation (every response JSON-parsed, `messages` present, correct count, `cursor` present; sizes stable 99554-104611B). Cloudflare is present (`cf-cache-status: DYNAMIC`, `__cf_bm` cookie) but never challenges. The command still applies a random 200-700ms sleep per request plus a 429/403/connection-error/5xx backoff retry (up to 3 attempts) as a conservative courtesy.
- Network failure / timeout / 5xx → `NETWORK_ERROR` or `API_ERROR`. A 200 response that is not valid JSON → `API_ERROR`. A 200 response missing the `messages` array or the first page's `symbol` object → `API_ERROR` (structure drift).

## Capture Assessment

- Capture as `stocktwits/get-symbol-posts`, runtime `node`, `authRequired: not-required`. The discussion stream is Stocktwits' core content shape; the endpoint is anonymous, rate-limit-free, and same-source with the website frontend. This is the domain's first command and the landing point for a symbol (feed symbols from `stocktwits/search` / `stocktwits/list-rankings`, or the `symbols` field of any post). The `max`-cursor pagination pattern fixed here is directly reused by `stocktwits/get-feed` and `stocktwits/get-user`.
