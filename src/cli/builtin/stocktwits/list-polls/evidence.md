# Evidence: stocktwits/list-polls

This document records the research and validation evidence for the `stocktwits/list-polls` command.

## Exploration Path

- Explored on 2026-08-20 (`websculpt explore assess` → `status: passed`, candidate `stocktwits/list-polls`).
- Command library check: `websculpt command list stocktwits` returns "No commands available" — the stocktwits domain has zero installed commands, so this is a fresh addition (one of the planned commands in the stocktwits command family).
- Runtime is `node`: a single HTTP fetch of the SSR HTML + parse of the embedded `__NEXT_DATA__` JSON. No browser, no login, no API key, no JS execution dependency (all data is server-rendered inline, `__N_SSP=true`).
- During capture the live page was re-fetched (2026-08-20) and every structural fact below was re-confirmed directly against the current HTML before writing `command.js`.

## Verified URLs

- https://stocktwits.com/discussions — the community polls SSR page. HTTP 200, ~746KB body, `__NEXT_DATA__` JSON block ~292KB. This is the ONLY request the command makes.
- https://stocktwits.com/discussions/if-you-had-to-choose-one-which-are-you-buying-nke-or-lulu/662079675 — verified discussion-detail URL built from `{slug}/{messageId}` (the NKE/LULU poll, id 7009, messageId 662079675).
- https://chunks-prd.stocktwits-cdn.com/_next/static/chunks/pages/discussions-0f064ebf994e3f9c.js — decompiled page component (module 85343): renders `data.polls.map(e => <DiscussionItem poll={e}/>)` with NO useEffect/fetch/IntersectionObserver/load-more state — proof the 50 polls are 100% SSR-embedded with no pagination.
- https://stocktwits.com/_next/data/{buildId}/discussions.json — Next.js client data endpoint; same 50 polls, same shape.
- Negative evidence (404, proving no public API resource exists): https://api.stocktwits.com/api/2/discussions.json , https://api.stocktwits.com/api/2/polls.json (plus 6 more guessed endpoints, all 404).

## Structural Evidence

- SSR data lives in `<script id="__NEXT_DATA__" type="application/json" crossorigin="anonymous">...</script>` — note the extra `crossorigin` attribute; the extraction regex must tolerate any attributes after `type="application/json"` (`[^>]*`).
- Parsed object: `props.pageProps.data` = `{ polls: [ ...50 items... ], response: { status: 200 } }`. `data.response` carries NO cursor / page / total metadata — there is no pagination anywhere.
- `polls[i]` top-level keys: `id, userId, discussion, status, question, description, sponsored, totalVotes, startsAt, expiresAt, choices, associations`.
  - `id`: number (poll id, e.g. 7193)
  - `status`: `"active"` | `"ended"` — the list MIXES both states newest-first (2026-08-20 live sample: 3 active / 47 ended); kept verbatim.
  - `question`: string (e.g. `Walmart ($WMT) stock is down despite a Q2 earnings beat ... Are you buying the dip?`)
  - `description`: string (may be empty)
  - `totalVotes`: number
  - `startsAt` / `expiresAt`: ISO 8601 UTC strings
  - `choices`: array of `{title: string, percent: number, selected: boolean}` (percent is the share 0-100)
  - `associations`: array of `{type: "stock", id, symbol, symbolDisplay, logoUrl}` — always present in the live sample (0/50 empty). The `symbols` output is extracted from entries where `type === "stock"`.
  - `discussion`: `{ id, slug, indexed, createdAt, discussionMessage, commentsCount }`
    - `discussion.slug`: the URL slug (e.g. `walmart-wmt-stock-is-down-despite-a-q2-earnings-beat-and-raised-full-year-profit-forecast-are-you-buying-the-dip`)
    - `discussion.commentsCount`: number of replies
    - `discussion.createdAt`: ISO UTC (equals `discussionMessage.createdAt` in the sample)
    - `discussion.discussionMessage`: `{ id (= messageId), body, tokenizedBody, createdAt, discussion, discussionId, discussionType: "poll", user, source, symbols, mentionedUsers, entities }`
      - `discussionMessage.id` = the `messageId` (e.g. 662396044) chained into `stocktwits/get-post`
      - `discussionMessage.symbols` is a RICH object array (id/symbol/title/watchlistCount/exchange/...) and is MISSING on 9/50 polls — not used; `associations` is the reliable symbol source.
- Discussion URL template: `https://stocktwits.com/discussions/{discussion.slug}/{discussionMessage.id}` — confirmed by the page's own rendered `<a href>` values and the NKE/LULU permalink.
- Fixed 50 polls, NO pagination — three independent lines of evidence: (1) SSR `data.response` has no cursor/page/total and the whole `__NEXT_DATA__` has no next/load-more fields; (2) the decompiled page component pure-maps `data.polls` with no fetch logic; (3) 8 guessed API endpoints all 404. URL params (`?page=2`, `?offset=50`, `?limit=100`) do not change the count.

## Failure Signals

- A transient HTTP 404 on `/discussions` was observed once during capture (1 of 3 fresh fetches; an immediate retry returned 200). Treat 404 as retryable (up to 3 attempts with backoff) and raise `NOT_FOUND` only if it persists.
- A 200 body WITHOUT the `__NEXT_DATA__` block → `DRIFT_DETECTED` (SSR structure changed).
- `props.pageProps.data.polls` missing or not an array → `DRIFT_DETECTED`.
- All polls fail to map (every `id` null) → `EMPTY_RESULT`.
- 429 / 403 → backoff-retry up to 3 attempts, then `RATE_LIMITED`.
- Fetch throw / timeout → `NETWORK_ERROR` (retried with backoff first).
- Live rate-limit test (2026-08-20): 10 rapid-fire requests (interval <0.1s) all HTTP 200 with a full 50-poll `__NEXT_DATA__`; zero 429/403, zero rate-limit response headers, no soft degradation (vote counts were live-changing across requests, confirming real data not a cache shell). Command still keeps a random 200-700ms pre-request sleep + backoff as a courtesy / defense in depth.

## Capture Assessment

- Capture as `stocktwits/list-polls`, runtime `node`, `authRequired: not-required`. The path is anonymous (no login, no browser, no API key), structurally verified against the live page, and cheap (one HTTP request). It covers a distinct content type — community polls with question text, related symbols, total vote counts, choice percentages, and start/expiry times — that no other command covers, and its `messageId` chains directly into the planned `stocktwits/get-post` (with `--include-replies`) to read the poll's discussion thread.
- The "fixed 50, no pagination" behavior is deliberately NOT paginated; a `limit` above what the page embeds sets `partial=true`. Contract was reviewed and confirmed on 2026-08-20.
