# Context

## Precipitation Background (Why This Command Exists)

Stocktwits had zero installed commands. `list-polls` is one of the planned additions in the stocktwits command family. The polls page (`/discussions`) is a distinct content type — "which stock would you buy, $NKE or $LULU?" style questions with live vote counts and per-choice percentages — not covered by the symbol streams / rankings / news commands. Exploration (assess `passed`, Confirmation 2026-08-20) verified the real structure and **corrected the plan's open question**: whether more than 50 polls are reachable via pagination. They are not — the page is fixed at 50 SSR-embedded polls with no pagination mechanism (three independent proofs), so the command deliberately has no pagination logic.

## Value Assessment

Reusable for "what is the community voting on right now" — a quick pre-market sentiment snapshot. Each poll's `messageId` chains directly into `stocktwits/get-post` (with `--include-replies`) for the discussion thread, and its `symbols` feed `get-symbol-overview` / `get-symbol-posts`. Cheap (one HTTP request), anonymous, and stable (no rate limit measured across 10 rapid requests; live data confirmed across requests). Reuse frequency: on-demand.

## Page Structure

- `https://stocktwits.com/discussions` — Next.js SSR page (HTTP 200, ~746KB body, `__NEXT_DATA__` ~292KB). All data server-rendered (`__N_SSP=true`).
- Data location: `<script id="__NEXT_DATA__" type="application/json" crossorigin="anonymous">...</script>` → `props.pageProps.data` = `{ polls: [50 items], response: {status: 200} }`. The regex must tolerate extra attributes after `type="application/json"`.
- `polls[i]` keys: `id, userId, discussion, status, question, description, sponsored, totalVotes, startsAt, expiresAt, choices, associations`.
  - `discussion`: `{id, slug, indexed, createdAt, discussionMessage, commentsCount}`.
  - `discussion.discussionMessage`: `{id (=messageId), body, createdAt, discussionType:"poll", user, symbols[], ...}`. `discussionMessage.symbols` is a rich object array and is MISSING on 9/50 polls — use `associations` (`type:"stock"`) for the output `symbols`.
- `status` mixes `active` + `ended` newest-first (2026-08-20 sample: 3 active / 47 ended) — the output keeps it verbatim.
- Discussion URL template: `https://stocktwits.com/discussions/{discussion.slug}/{discussionMessage.id}`.
- **Fixed 50, no pagination** — three independent proofs: (1) `data.response` and the whole `__NEXT_DATA__` have no cursor/page/total; (2) decompiled page component (chunk `pages/discussions-0f064ebf994e3f9c.js`, module 85343) pure-maps `data.polls` with no fetch/load-more; (3) `?page=2`/`?offset=50`/`?limit=100` don't change the count and 8 guessed API endpoints all 404.

## Environment Dependencies

- No login, no browser, no API key; anonymous HTTP 200 with a standard Chrome User-Agent.
- Polite pacing: random 200-700ms sleep before every request. Measured unlimited (10 rapid-fire requests, 0 blocks, no rate-limit headers, live data), but the sleep keeps the command conservative; 429/403/404/5xx/network errors backoff-retry up to 3 attempts.
- Node runtime: global `fetch` + `AbortController` (Node 18+). No third-party modules.

## Failure Signals

- Transient HTTP 404 on `/discussions` observed once during capture (immediate retry returned 200) — retryable; a persistent 404 raises `NOT_FOUND`.
- 200 body without `__NEXT_DATA__`, or `props.pageProps.data.polls` missing/not an array → `DRIFT_DETECTED` (structure changed).
- Zero mapped polls → `EMPTY_RESULT`.
- 429/403 after retries → `RATE_LIMITED`; 5xx after retries → `API_ERROR`; network/timeout after retries → `NETWORK_ERROR`.

## Repair Clues

- If the SSR block stops matching, re-fetch `/discussions` and re-derive the script-tag attribute order (the `[^>]*` in the regex tolerates added attributes; a removed `type="application/json"` would need a regex update).
- If the output `symbols` start coming up empty, check whether `associations` changed shape; fall back to `discussion.discussionMessage.symbols[].symbol` if needed (but note it is currently missing on 9/50 polls).
- If a pagination mechanism ever appears (e.g. `data.response` gains a cursor), revisit the plan's original "limit up to 100 + pagination" idea — the current contract is explicitly no-pagination.
