# Evidence: stocktwits/get-user

This document records the research and validation evidence for the `stocktwits/get-user` command.

## Exploration Path

Command library check: `websculpt command list stocktwits` returned `No commands available.` (exit 0) at explore time — no stocktwits-domain command existed to reuse or conflict with; a later-installed `stocktwits/search` (browser runtime, user source) was out of scope and NOT reused (different runtime). The command-family plan defines `get-user` as capture order #4 (after get-symbol-posts / get-symbol-overview / list-rankings); the plan's shared cursor-pagination and message-shape facts apply. Exploration verified the anonymous REST endpoint end-to-end; the contract was reviewed and confirmed on 2026-08-20.

Runtime is **node**: the path is anonymous public JSON API hit directly with curl/node (no DOM, no browser session, no login, no file system). Node runtime contract consulted per WebSculpt capture rules before editing `command.js`. Polite pacing (policy): random sleep 200-700ms before each request + backoff retry on TCP connection drops (explore-reproduced) and on 429/403.

## Verified URLs

- `https://api.stocktwits.com/api/2/streams/user/fredwilson.json` — profile + stream (rate-limit stress main endpoint; user id 28835, latest post 2011)
- `https://api.stocktwits.com/api/2/streams/user/fredwilson.json?limit=30&max=1766153` — cursor pagination page 2 (all post ids strictly older than page 1, no overlap)
- `https://api.stocktwits.com/api/2/streams/user/Stocktwits.json` — official account (id 170) with `likes` / `symbols` / `pinned_message` present
- `https://api.stocktwits.com/api/2/streams/user/Stocktwits.json?filter=bullish&limit=3` — filter really filters (3/3 posts carry Bullish tag)
- `https://api.stocktwits.com/api/2/streams/user/fredwilson.json?filter=latest` — HTTP 400 invalid filter (user streams do NOT support `latest`)
- `https://api.stocktwits.com/api/2/streams/user/thisuserdoesnotexist_zzq9x.json` — HTTP 404 non-existent user
- `https://api.stocktwits.com/api/2/streams/user/Stocktwits.json?limit=31` / `?limit=100` — single page capped at 30 posts (server silently caps, no error)
- `https://api.stocktwits.com/api/2/messages/show/662399253.json` — message field reference (confirms no `url` field on messages)

## Structural Evidence

Endpoint: `GET https://api.stocktwits.com/api/2/streams/user/{username}.json` — anonymous public API, no auth, no cookie, no signature. Query params: `limit` (single-page size, server caps at 30), `filter` (`top` default | `bullish` | `bearish` | `all`), `max` (cursor: pass `body.cursor.max` for the next older page). `limit` in the command is an OUTPUT cap (1-100), implemented by paging 30 at a time internally. Headers: Chrome desktop UA required; `Accept: application/json`.

Response envelope (HTTP 200), top keys: `user, cursor, regions, filters, messages, pinned_message, response` (`response` = `{"status":200}` wrapper).

User profile fields (all verified): `id / username / name / avatar_url / avatar_url_ssl / join_date / official / identity / classification / badges / search_regions / followers / following / ideas / watchlist_stocks_count / like_count / plus_tier / premium_room / trade_app / trade_status`. Optional extras: `home_country`, `company_representative`. `badges` may be `[]` or an array of structured badge objects (`type/show_icon/icon_url/modal/tag/symbol/deeplink`, e.g. `official`, `company_representative`). `plus_tier` is a string (plain users `""`). `pinned_message` (present on some accounts) is a full message object.

Message fields: `id, body, tokenized_body, created_at, discussion, source, mentioned_users, entities, user`, plus new-post-only `prices / reshare_message / likes / symbols`. `entities.sentiment` = `{basic: "Bullish"|"Bearish"}` or `null`. `likes` = `{total: int, user_ids: [int]}` — an OBJECT, not a plain number (profile-level `like_count` is the plain number). `symbols` = array of symbol objects (`symbol/symbol_mic/symbol_display/exchange/region/logo_url/title/aliases/deeplink/external_id/is_following/watchlist_count/has_pricing/instrument_class/live_event/trade_status/sentiment_change/volume_change`). `source` = `{id, title, url}`. Old posts (circa 2010) may lack `likes/symbols/prices/reshare_message` — the implementation must default gracefully.

Pagination: `cursor` = `{more: bool, since: <max id>, max: <min id>}`. Next page passes `max={cursor.max}`; `more=false` = end of stream. Single page hard-caps at 30 posts (`limit=30/31/100` all return 30, no server error). `filter=top` returns exactly the same stream as omitting `filter` (default is `top`).

Permalink: stream messages have NO `url` field. During exploration `https://stocktwits.com/{username}/{id}`, `/messages/{id}`, `/symbol/{symbol}/{id}` all returned 404; only `/discussions/{slug}/{id}` (poll/discussion messages) resolves. Per the contract, the command constructs `posts[].url` as `https://stocktwits.com/{username}/message/{id}` (display convenience; not guaranteed to resolve).

Output mapping (contract):
- `user`: `{id, username, name, avatarUrl (avatar_url), joinDate (join_date), official (bool), followers, following, ideas, watchlistStocksCount (watchlist_stocks_count), likeCount (like_count), plusTier, badges}`
- `pinnedMessage`: present only when the account has a pinned message (mapped like a post)
- `posts[]`: `{id, url (constructed), body, createdAt (created_at), sentiment (entities.sentiment.basic, Bullish|Bearish|null), likeCount (likes.total, plain number), user: {id, username, name, avatarUrl, followers, ideas}, symbols: [string] (map of symbol objects → their `symbol` string)}`
- `partial`: true when the cursor stream is exhausted before reaching `limit`

## Failure Signals

- **Non-existent user**: HTTP 404, body `{"errors":[{"message":"User not found"}],"response":{"status":404}}` → command throws `NOT_FOUND`.
- **Invalid filter** (e.g. `latest`): HTTP 400, body `{"errors":[{"message":"latest contains an invalid filter: latest"}],"response":{"status":400}}`. User streams support only `top/bullish/bearish/all` (unlike symbol streams). Command pre-validates the enum → `INVALID_PARAM`; a defensive 400 from the server is also mapped to `INVALID_PARAM`.
- **Connection-level throttling (explore-reproduced twice)**: rapid no-sleep same-endpoint bursts drop the ~5th NEW connection at TCP level — `curl 28 Failed to connect ... port 443 after ~21050 ms` (SYN timeout, NO HTTP response), then the 6th request recovers immediately and a 3s pause before retry succeeds in ~0.6s. A 250ms interval slow burst does NOT trigger it. => the implementation MUST back off and retry fetch connection errors (random sleep + up to 3 attempts), never fail on the first dropped connection. HTTP layer itself stays clean: no 429/403/soft-degrade across ~50 requests, no rate-limit headers (only Cloudflare `CF-RAY`), full bodies returned.
- **HTTP 429/403**: not observed on this API but handled defensively with exponential-backoff retry (up to 3 attempts), then `RATE_LIMITED`.
- **Missing fields on old posts**: `likes/symbols/prices` absent → defaults (`likeCount: 0`, `symbols: []`, `sentiment: null`).
- **Stream shorter than `limit`**: `cursor.more=false` before enough posts collected → `partial: true` (not an error).
- **Empty stream**: user exists but has no messages → `posts: []`, `partial: true`.

## Capture Assessment

Capture eligible: yes. The path is parameterizable (username / limit / filter), publicly accessible (anonymous, no login), and a pure node command (curl/node direct public JSON API, no browser). One request returns both the profile and the first page of posts; cursor pagination reaches back through history. The connection-drop behavior is the one platform quirk — handled with the mandatory 200-700ms random sleep plus backoff retry. `username` chains from `stocktwits/search` (user results) or the `user.username` field of any post. Contract confirmed on 2026-08-20.
