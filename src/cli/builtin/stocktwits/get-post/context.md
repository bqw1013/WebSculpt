# Context

## Precipitation Background (Why This Command Exists)

Precipitated 2026-08-20 as part of the Stocktwits command family (the command-family plan). The family's list commands — get-symbol-posts / get-feed / get-user — emit numeric post `id` fields, and list-polls emits `messageId`; get-post is the single-post detail + reply-thread landing point that closes the "list → detail" loop. Exploration audited (status: passed).

## Value Assessment

- Reuse frequency: high — every Stocktwits list command funnels into it for detail reads; reading a discussion楼 (poll thread) is a common task.
- Time saved: avoids re-deriving the two public endpoints, the non-obvious `conversation` shape (`{parent, message, children:{messages, cursor}}` — replies are NOT in a `parent.replies`), and the cursor-pagination semantics (`since` = newest id in window).
- Covers both a "show detail" path and an optional "fetch thread with pagination" path in one command.

## Page Structure

- Full text: `GET https://api.stocktwits.com/api/2/messages/show/{id}.json` → `{message: {...}, response: {status}}`.
  - `message.entities.sentiment.basic` = `"Bullish" | "Bearish" | null`.
  - `message.likes.total` exists ONLY on discussion/poll posts (`discussion=true`); regular posts have no `likes` → `likeCount: null`.
  - `message.conversation.replies` is a stale/approximate count (measured poll showed 19 while the real paginated total was 34) → do not trust it as authoritative.
  - `message.symbols[].symbol` → output `symbols` string array.
  - `message.user`: use `avatar_url` (fallback `avatar_url_ssl`) → `avatarUrl`; `followers`/`ideas` are numbers.
- Reply thread: `GET https://api.stocktwits.com/api/2/messages/{id}/conversation.json?limit=30&since={cursor}` → `{parent, message, children: {messages, cursor}}`.
  - Replies in `children.messages`, ordered by id ascending (oldest first).
  - `cursor.more` = more pages; `cursor.since` = newest id in current window — pass as `?since=` to get newer replies (no overlap measured).
  - `?limit` honored up to 30/page; `?sort=asc/desc` ignored.
  - `parent` is null for root-post targets; when target is a reply, `parent` is the root OP and `children.messages` are that reply's own deeper replies.
  - Replies carry `likes:{total, ...}`; usually no `symbols`/`prices`.
- URL: no stable public permalink page (all `stocktwits.com/messages/{id}`-style URLs return 404). Output `url` is constructed as `https://stocktwits.com/{username}/message/{id}` per the contract.

## Environment Dependencies

- Anonymous public JSON API — no login, no API key, no browser. Node runtime.
- UA must look like a browser (Chrome UA constant). Requests go through the machine's global routing; if the tunnel is off, international traffic fails and the command surfaces `NETWORK_ERROR`.
- Polite pacing: random 200-700ms sleep before every request; 429/403 and connection errors retried with backoff (max 3 attempts). Measured the API is effectively unthrottled (~140+ rapid requests in the session, 0 × 429/403), but keep the polite baseline.

## Failure Signals

- Nonexistent id → HTTP 404 `{"errors":[{"message":"Message not found"}]}` → command throws `NOT_FOUND`.
- Non-numeric `--id` is rejected locally as `INVALID_PARAM` before any HTTP call (regex `/^\d+$/` on the raw string — never parseInt on a non-validated string).
- 429/403 → `RATE_LIMITED` after 3 backoff attempts; connection/timeout → `NETWORK_ERROR` after 3 attempts; other non-2xx / non-JSON → `API_ERROR`.
- Structure drift: if the conversation response loses `children.messages`, or show loses `message`, the command throws `API_ERROR` — re-explore those endpoints.

## Repair Clues

- If `messages/show` or `conversation` endpoints move/change: re-run the exploration (endpoints are the same public `api.stocktwits.com/api/2/` JSON API used by get-symbol-posts / get-feed; sibling command traces record the same API).
- Real post ids for tests come from `streams/symbol/AAPL.json` or `streams/trending.json` (id fields), or list-polls messageId.
- `reply_limit` pagination: the API caps at 30/page; the since-cursor path is verified (page2 returns only newer replies, no overlap). If pagination ever duplicates, re-check the `since` cursor semantics.
- Alternative entry: none needed — public API is the sole verified path; the SSR page data is only used by get-symbol-overview, not here.
