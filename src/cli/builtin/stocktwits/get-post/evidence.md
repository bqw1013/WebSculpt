# Evidence: stocktwits/get-post

This document records the research and validation evidence for the `stocktwits/get-post` command.

## Exploration Path

- Command library overlap check: `websculpt command list stocktwits` returned `No commands available.` before this capture; the only installed stocktwits command at snapshot time is `stocktwits/search` (browser runtime, unrelated). No existing get-post command conflicts; this is a new command.
- Exploration workspace was fully audited (`websculpt explore assess` → `status: passed`), with the contract reviewed and confirmed on 2026-08-20.
- Runtime consulted: node runtime contract. Chosen runtime is `node` because both endpoints are anonymous public JSON APIs reachable via plain `fetch` (no JS rendering, no login, no browser); the command has pagination and an include-replies branch that need scripted parsing.
- Background reference: the command-family plan was read. Where the plan conflicts with measured API behavior, the trace measurements (below) win.

## Verified URLs

- https://api.stocktwits.com/api/2/messages/show/662401099.json (regular post, full text, HTTP 200)
- https://api.stocktwits.com/api/2/messages/show/662400515.json (regular post with sentiment=Bearish, HTTP 200)
- https://api.stocktwits.com/api/2/messages/show/655544902.json (discussion/poll post with likes + conversation, HTTP 200)
- https://api.stocktwits.com/api/2/messages/655544902/conversation.json?limit=30 (reply thread, 30 children, HTTP 200)
- https://api.stocktwits.com/api/2/messages/655544902/conversation.json?limit=5 (limit honored, 5 children, HTTP 200)
- https://api.stocktwits.com/api/2/messages/655544902/conversation.json?limit=30&since=655693839 (cursor page 2, 4 newer replies, no overlap, HTTP 200)
- https://api.stocktwits.com/api/2/messages/655554528/conversation.json (target is a reply: parent=root OP, children empty, HTTP 200)
- https://api.stocktwits.com/api/2/messages/show/999999999999.json (nonexistent id, HTTP 404 `Message not found`)
- https://api.stocktwits.com/api/2/messages/show/abc.json (non-numeric id, HTTP 404 `Message not found` — command rejects earlier via local validation as INVALID_PARAM)
- https://api.stocktwits.com/api/2/streams/symbol/AAPL.json (source of real post ids; `filter=latest` returns HTTP 400)
- https://api.stocktwits.com/api/2/streams/trending.json (source of recent real ids for tests)
- https://stocktwits.com/messages/655544902 (HTTP 404 — no stable public permalink page exists)

## Structural Evidence

### Endpoint 1 — full text: `GET /api/2/messages/show/{id}.json`

- Response shape: `{ "message": {...}, "response": {"status": 200} }`.
- Regular post `message` keys (measured): `id, body, tokenized_body, created_at, discussion, source, prices, mentioned_users, entities, user, symbols`.
- Regular posts have NO `likes` and NO `conversation` fields → `likeCount` and `replyCount` are `null` for them.
- Discussion/poll posts (`discussion: true`) additionally carry: `likes: {total, user_ids}`, `conversation: {parent_message_id, in_reply_to_message_id, parent, replies}`, `reshares`, `discussion_id`, `discussion_type`, and `entities.discussable`. Measured poll 655544902: `likes.total=34`, `conversation.replies=19` (stale/approximate — the real paginated total is 34 replies).
- `entities.sentiment.basic` is `"Bullish" | "Bearish" | null` (measured null and Bearish).
- `message.symbols` is an array of `{id, symbol, title, ...}` → output `symbols` is `message.symbols.map(s => s.symbol)`.
- `message.user` fields used: `id, username, name, avatar_url, avatar_url_ssl, followers, ideas` → output `user: {id, username, name, avatarUrl, followers, ideas}` (`avatarUrl` prefers `avatar_url`, falls back to `avatar_url_ssl`).
- `message.prices` exists but is not surfaced in output (per contract).
- 404 for missing/nonexistent id: HTTP 404 `{"errors":[{"message":"Message not found"}],"response":{"status":404}}`.

### Endpoint 2 — reply thread: `GET /api/2/messages/{id}/conversation.json?limit=30&since={cursor}`

- Response top-level shape: `{ "parent": {...}|null, "message": {...}, "children": { "messages": [...], "cursor": {more, max, since} } }` — NOT the plan's `{parent, replies}`.
- Replies live in `children.messages` (NOT `parent.replies`).
- `parent` is `null` when the target id is a root post; when the target id is a reply, `parent` is the root OP message.
- Replies are ordered by id ascending (earliest first). Measured page 1 ids 655554528 → 655693839.
- Pagination: pass `?since=<cursor.since>` to fetch NEWER replies (cursor.since = newest id in the current window). Measured `since=655693839` returned 4 newer replies with zero overlap. `?limit` is honored up to 30 per page; `?sort=asc/desc` is ignored.
- Reply `message` keys (measured, replies DO carry likes): `id, body, tokenized_body, created_at, discussion, discussion_id, discussion_type, source, conversation, mentioned_users, entities, user, likes`. `likes: {total, recent, user_ids}` (measured child total=7). Replies usually have no `symbols`/`prices`.
- Regular (non-discussion) posts have empty threads: `children.messages=[]`, `cursor.more=false` (measured for 662401099, 662400515, 662407186).
- `message.conversation.replies` is a stale/approximate count and must NOT be treated as the authoritative reply total.
- 404 behavior identical to show endpoint.

### URL construction

- No stable public permalink page exists: `stocktwits.com/messages/{id}`, `stocktwits.com/{user}/{id}`, `stocktwits.com/symbol/{sym}/{id}` are all HTTP 404. Per the contract, the output `url` is constructed as `https://stocktwits.com/{username}/message/{id}` (a deeplink hint only, not guaranteed to open the post directly).

### Rate limiting

- Measured ~140+ rapid requests in this session (plus ~340 in a prior comprehensive exploration): 0 HTTP 429, 0 HTTP 403, no verification challenge, no soft degradation (response byte sizes constant across identical calls).
- No `x-ratelimit` / `rate-*` response headers present.
- Implementation still keeps a polite random 200-700ms sleep before each request and a backoff retry on 429/403/network errors (max 3 attempts) as a defensive baseline.

## Failure Signals

- Nonexistent/non-numeric id → HTTP 404 `Message not found` JSON body → command maps to `NOT_FOUND`.
- Non-numeric `--id` is rejected locally with `INVALID_PARAM` (regex `/^\d+$/` on the raw string) before any HTTP call, so it never reaches the API.
- HTTP 429/403 → backoff retry (max 3 attempts) then `RATE_LIMITED`.
- Connection failure / request timeout (20s AbortController) → backoff retry (max 3 attempts) then `NETWORK_ERROR`.
- Any other non-2xx HTTP status → `API_ERROR`.
- Drift signal: conversation response missing `children.messages`, or show response missing `message` → `API_ERROR` (structure changed).
- `message.conversation.replies` is stale; do not rely on it as a live reply count.

## Capture Assessment

This command should be captured. It is the detail-resolution landing point for every stocktwits list command (get-symbol-posts / get-feed / get-user emit numeric `id` fields; list-polls emits `messageId`), and the only way to read a full post body plus its reply thread. Both endpoints are anonymous, public, unauthenticated JSON APIs reachable via plain `fetch` with a Chrome UA — ideal for the `node` runtime (no browser, no login). The include-replies branch adds cursor pagination logic that benefits from a scripted, reusable command rather than ad-hoc calls. No prerequisites (no API key, no login, no browser).
