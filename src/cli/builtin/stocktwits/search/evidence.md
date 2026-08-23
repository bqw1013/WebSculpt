# Evidence: stocktwits/search

This document records the research and validation evidence for the `stocktwits/search` command.

## Exploration Path

- Command library overlap check at explore time: `websculpt command list stocktwits` returned no visible commands. An older local `stocktwits/search` command (browser runtime, different endpoint) existed outside scope; the confirmed contract supersedes it with a node runtime and the simpler public `search.json` endpoint.
- Explored the public Stocktwits v2 API directly with curl and Node https (no browser, no login) during the explore session on 2026-08-20; every request used UA=Chrome and a random 200-700ms pre-request sleep.
- A command-family planning document and the authoritative explore trace were consulted. Where the plan differs from measured behavior, the measured behavior wins (see Structural Evidence).
- Consulted the node runtime contract before writing `command.js`.

## Verified URLs

- https://api.stocktwits.com/api/2/search.json?q=AAPL
- https://api.stocktwits.com/api/2/search.json?q=Tesla
- https://api.stocktwits.com/api/2/search.json?q=fredwilson
- https://api.stocktwits.com/api/2/search.json?q=%E8%8B%B9%E6%9E%9C
- https://api.stocktwits.com/api/2/search.json?q=a
- https://api.stocktwits.com/api/2/search.json?q=zzxq9mnv2k7w8j4r6t0

All return HTTP 200. The single public endpoint is `GET https://api.stocktwits.com/api/2/search.json?q={query}`; the list above was actually requested and parsed during explore.

## Structural Evidence

- Response envelope: `{"results": [...], "response": {"status": 200}}` — no pagination fields, no cursor, no total counter.
- `results[]` is a flat array of mixed records; each record carries a `type` discriminator: `"symbol"` or `"user"`.
- Symbol records: `type, id, title, symbol, exchange, weight_offset?, watchlist_count?, country?`.
  - The primary listing (e.g. AAPL / NASDAQ) may carry ONLY `type,id,title,symbol,exchange` — `watchlist_count` and `country` are optional/absent on some records (verified stable for AAPL); TSLA's primary entry did include `watchlist_count`/`country`. These fields must be read defensively.
  - Crypto variants (symbol ending `.X`) additionally carry `weight_offset` and often an empty-string `country`.
  - NO `logo_url` field exists anywhere in search results (full scan across all test queries, 0 hits) — the plan's `logoUrl` was dropped from the confirmed contract.
- User records: `id, type, username, name, avatar_url, official, premium, verified, company_representative?`.
  - `company_representative` is present on normal queries but missing on some Chinese spam accounts — read defensively; `verified` is always present.
- Result cap: multi-character keywords return exactly 15 records (AAPL / Tesla / fredwilson / 苹果 all 15); single-character `q=a` returns 16 records, all symbols.
- Query params `limit`, `page`, `type`, `filter` are silently IGNORED by the API (byte-identical responses to `q=AAPL`) — the command exposes none of them and does not paginate.
- No-hit search returns HTTP 200 with an empty array (`{"results":[],"response":{"status":200}}`), NOT an error; an empty `q=` behaves the same. No-hit is therefore a normal empty result, not `NOT_FOUND`.
- Node https with UA=Chrome parses JSON directly; no browser, no login, no cookies required.

## Failure Signals

- HTTP 429/403: never observed across ~50 rapid requests, but treated as retryable transient failures (backoff + up to 3 attempts) per family policy.
- Client-side connection drop / 15s timeout: observed once in a 20-request no-sleep burst (request #2), not reproduced — evidence for a polite per-request sleep (200-700ms) plus retry/backoff.
- No rate-limit response headers (`x-ratelimit-*`, `retry-after`, etc.); only `x-request-id`. No soft degradation (truncated/empty-but-200) ever observed.
- Drift signals: non-JSON body, missing `results` array, or non-2xx status → `API_ERROR`; persistent 429/403 → `RATE_LIMITED`; connection drop/timeout across retries → `NETWORK_ERROR`; missing/empty `query` → `MISSING_PARAM`.

## Capture Assessment

Capturable. This is a single stable anonymous public JSON endpoint verified during explore: no login, no browser, no pagination, one request per query. It is the discovery entry point for the rest of the stocktwits family (get-symbol-posts / get-symbol-overview / get-user consume the `symbol` / `username` produced here). The confirmed contract — node runtime, `search.json` endpoint, flat results split by `type` into `symbols`/`users`, tolerant of optional fields — is implemented in this capture.
