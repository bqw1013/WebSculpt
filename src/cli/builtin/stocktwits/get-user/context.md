# Context

## Precipitation Background (Why This Command Exists)

Part of the Stocktwits command family (capture order #4: get-symbol-posts → get-symbol-overview → list-rankings → get-user). The user profile page `stocktwits.com/{username}` shows a profile header + the user's post stream; the command replicates both from the anonymous REST endpoint `api.stocktwits.com/api/2/streams/user/{username}.json` (the same endpoint the site's frontend calls). Verified end-to-end in explore; the contract was reviewed and confirmed on 2026-08-20.

## Value Assessment

High reuse: `username` chains directly from `stocktwits/search` (user results) or the `user.username` field of any post from get-symbol-posts / get-feed / search. A single request returns the full profile + first page; cursor pagination reaches back through the user's history. The shared message-shape + cursor-pagination pattern is reused by the sibling get-symbol-posts / get-feed commands, so one drift fix propagates. No login, no browser.

## Page Structure

- API: `GET https://api.stocktwits.com/api/2/streams/user/{username}.json?limit={1-30}&filter={top|bullish|bearish|all}[&max={cursor}]`
- Response top keys: `user, cursor, regions, filters, messages, pinned_message, response` (`response` = `{"status":200}`).
- `cursor` = `{more, since, max}`; next older page passes `max={cursor.max}`; `more=false` = end. Single page hard-caps at 30.
- Profile mapping: `avatar_url→avatarUrl`, `join_date→joinDate`, `official` (bool), `followers/following/ideas/watchlist_stocks_count/like_count` (plain numbers), `plus_tier` (string), `badges` (array of `{type, show_icon}`; may be `[]`). `pinned_message` = a full message object when present.
- Message mapping: `created_at→createdAt`, `entities.sentiment.basic→sentiment` (`Bullish`/`Bearish`/null), `likes.total→likeCount` (OBJECT at message level), `symbols[].symbol→symbols:[string]`, `user→{id, username, name, avatar_url, followers, ideas}`. No `url` on messages — command constructs `https://stocktwits.com/{username}/message/{id}` per the contract (display convenience; `/discussions/{slug}/{id}` was the only verified-reachable permalink form).
- Page reference: `https://stocktwits.com/{username}`.

## Environment Dependencies

- Anonymous REST, no login, no cookie, no signature. Node runtime; only outbound HTTPS to `api.stocktwits.com` is required.
- Headers: Chrome desktop UA (Chrome/131) + `Accept: application/json`.
- Polite pacing (policy): random 200-700ms sleep before EVERY request.
- **Connection-level throttle (this platform's quirk, explore-reproduced twice)**: no-sleep rapid bursts silently drop the ~5th NEW connection at TCP level (curl 28 SYN timeout, no HTTP response), then the next request recovers and a ~3s pause before retry succeeds in <1s. The command MUST back off + retry fetch connection errors (random sleep + up to 3 attempts) and never fail on the first dropped connection. 250ms+ spacing avoids the drop entirely.
- HTTP 429/403: not observed on this API (~50 requests), but handled defensively with backoff retry (up to 3 attempts) then `RATE_LIMITED`.
- Do not restart the shared daemon; no browser attach is involved for this node command.

## Failure Signals

- Missing user → HTTP 404 `{"errors":[{"message":"User not found"}]}` → `NOT_FOUND`.
- Invalid filter (e.g. `latest`) → HTTP 400 `{"errors":[{"message":"latest contains an invalid filter: latest"}]}` → `INVALID_PARAM` (pre-validated in code; defensive server 400 also mapped).
- Old posts missing `likes/symbols/prices` → defaults (`likeCount: 0`, `symbols: []`, `sentiment: null`).
- Stream shorter than `limit` / account with no posts → `partial: true`, `posts: []`.
- HTTP 200 but response missing `messages`/`user`, or non-200 status → `API_ERROR` (API moved or behind a challenge page).
- Response not JSON (HTML challenge) → caller's non-200/structural check fires → `API_ERROR`.

## Repair Clues

- If the API moves or the envelope shape changes (`messages`/`cursor`/`user` missing or renamed), re-verify with curl against `api.stocktwits.com/api/2/streams/user/fredwilson.json` and update the mapping in `evidence.md`.
- The shared message-shape + cursor-pagination pattern is used by `stocktwits/get-symbol-posts` and `stocktwits/get-feed` — fix them together if the pattern drifts.
- If connection drops become more frequent (the site tightening throttling), increase the polite pacing floor (e.g. 300-800ms) and/or the connection-error backoff; see the explore trace's rate-limit section for the measured behavior.
- If Stocktwits starts requiring a signed token on this endpoint (currently plain public API), the family may need browser runtime or cookie injection.
