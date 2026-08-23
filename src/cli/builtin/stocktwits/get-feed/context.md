# Context

## Precipitation Background (Why This Command Exists)

Created on 2026-08-20 as part of the Stocktwits command family. The anonymous homepage (`stocktwits.com/`) is a platform-wide pulse view — "what is the whole market talking about right now" — and its message stream is served by the public `streams/trending.json` endpoint. The command gives a one-screen entry point into that flow without loading the whole site. It was the 4th planned command; the path was fully explored and assessed (`status: passed`), with the contract confirmed on 2026-08-20.

## Value Assessment

High generality and reuse: it answers "what is trending across all of Stocktwits right now" in one call, with no login/browser. Cheap to run (a few plain JSON GETs). The cursor-pagination pattern here (30/page + `max` cursor, `partial=true` when exhausted) is shared with the sibling commands get-symbol-posts and get-user, so fixes here likely apply there too.

## Page Structure

- Endpoint: `https://api.stocktwits.com/api/2/streams/trending.json`
  - First page: `?limit=30`
  - Next pages: `?limit=30&max=<cursor.max>` (older messages; `cursor.max` = oldest id on the current page)
- Response envelope: `{ cursor: {more, since, max}, messages: [...], response: {status} }`
- Message fields used: `id`, `body`, `created_at` (ISO8601 UTC), `entities.sentiment.basic` (`"Bullish"|"Bearish"|null`), `likes.total` (only present when >0), `user {id, username, name, avatar_url_ssl, followers, ideas}`, `symbols[].symbol`.
- Permalink: only `https://stocktwits.com/{username}/message/{id}` returns 200 (probed: `/{id}`, `/messages/{id}`, `/symbol/{sym}/{id}`, `/{user_id}/message/{id}` all 404).
- Optional out-of-scope params the API also accepts: `filter=bullish|bearish|top`, `since=<id>` (documented in trace; not exposed in this command).

## Environment Dependencies

- No login, no cookie, no browser. Anonymous public API.
- UA: Chrome/131 user agent (same as exploration). The API serves fine without it; keeping a Chrome UA makes behavior stable.
- Polite pacing: random 200-700ms sleep before every HTTP request; retry with backoff (max 3) on 429/403/connection errors. Exploration showed the endpoint is effectively not hard-rate-limited (90 rapid calls + 10 deep-cursor calls all HTTP 200, no rate-limit headers), but the polite interval + retry is kept as a safety net.
- Note: this API serves at most 30 messages per page regardless of `limit`; `limit=0/-1/abc` return 1 message (silent fallback), so the command validates `--limit` itself (1-100) rather than trusting the API.

## Failure Signals

- Non-2xx: HTTP 429/403 → `RATE_LIMITED` after retries; other non-2xx → `API_ERROR`.
- Network/connection failure on all 3 attempts → `NETWORK_ERROR`.
- Body no longer JSON, or JSON without a `messages` array → `DRIFT_DETECTED`.
- `cursor.more === false` while fewer posts than requested were collected → stream exhausted → `partial=true` (not an error).
- Defensive guard: if `cursor.more` is true but `cursor.max` is missing/undefined, treat the stream as exhausted (`partial=true`) instead of infinite-looping.
- Non-fatal conditionals (no drift): missing `likes` (likeCount 0), missing `entities.sentiment` (null), missing `user` subfields (null/0), missing `symbols` (empty array), missing `username` (permalink falls back to empty username path).

## Repair Clues

- If `DRIFT_DETECTED` appears, re-run the explore path against `streams/trending.json` and diff the envelope/message keys with `Structural Evidence` in the trace.
- If the permalink format ever 404s, re-probe the URL forms recorded in the trace; the username-form permalink was the only verified 200.
- If pagination loops or duplicates appear, re-verify cursor continuity (ids strictly monotonic decreasing) as recorded in the trace.
- Sibling commands sharing the same pattern: stocktwits/get-symbol-posts, stocktwits/get-user (both in the plan). Search (installed) covers the entity-search entry point.
