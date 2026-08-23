# Evidence: stocktwits/list-earnings

This document records the research and validation evidence for the `stocktwits/list-earnings` command.

## Exploration Path

- Explored on 2026-08-20 (`websculpt explore assess` → `status: passed`, candidate `stocktwits/list-earnings`).
- Command library check: `websculpt command list stocktwits` → "No commands available." The stocktwits domain had zero commands at explore time; `list-earnings` is a new command (`new`, no conflict, no reuse). (Concurrent sibling captures were created later for other stocktwits commands.)
- No browser automation was needed: every fetch was a plain anonymous HTTP GET with a standard Chrome User-Agent via curl/node. No login, no API key, no JS challenge, no daemon. Runtime fixed as `node`.
- Endpoint selection: the earnings calendar is **SSR-only** — the page references only `api.stocktwits.com/api/2/` for its side widgets; there is no independent earnings-calendar JSON API. Therefore the command parses the embedded `__NEXT_DATA__` JSON from the calendar page HTML.

## Verified URLs

- https://stocktwits.com/sentiment/calendar — earnings calendar, no `date` param → current week (HTTP 200, ~305KB; `activeWeek`/`date_from`/`date_to` = the current week's Mon–Fri).
- https://stocktwits.com/sentiment/calendar?date=2026-08-10 — past week (HTTP 200; returns the 2026-08-10 ~ 08-14 week).
- https://stocktwits.com/sentiment/calendar?date=2026-08-15 — Saturday; normalizes to the 2026-08-10 ~ 08-14 calendar week.
- https://stocktwits.com/sentiment/calendar?date=2026-08-16 — Sunday; normalizes to the 2026-08-10 ~ 08-14 calendar week.
- https://stocktwits.com/sentiment/calendar?date=2026-08-17 — current week (08-17 ~ 08-21).
- https://stocktwits.com/sentiment/calendar?date=2026-09-14 — future light week (29 stocks, all in-week).
- https://stocktwits.com/sentiment/calendar?date=2026-11-09 — future big earnings week (754 stocks, all in-week; e.g. PLUG/Block).
- https://stocktwits.com/sentiment/calendar?date=2020-01-01 — far-past date (HTTP 200 but stocks all empty).
- https://stocktwits.com/sentiment/calendar?date=2030-01-01 — far-future date (HTTP 200 but stocks all empty; week clamped to 2029-12-31 ~ 2030-01-02).
- https://stocktwits.com/sentiment/calendar?date=2026-13-99 — invalid date → HTTP 307 redirect to `/sentiment/calendar` (drops param → current week).
- https://stocktwits.com/sentiment/calendar/2026/08/10 — path form → HTTP 307 redirect to `/sentiment/calendar` (path segments ignored; must use `?date=`).

## Structural Evidence

- Page shape: SSR HTML. Data lives in `<script id="__NEXT_DATA__" type="application/json">...</script>` → `props.pageProps.initialData`.
- `initialData.earningsData` (verified fields): `{ "activeWeek": "2026-11-09", "country": "US", "earningsData": { "country": "US", "date_from": "2026-11-09", "date_to": "2026-11-13", "earnings": { "<YYYY-MM-DD>": { "day": "Monday", "month": "November", "year": "2026", "date_number": "9", "stocks": [ ... ] } } } }`.
- `earnings` is an object keyed by the day-bucket date; the queried week's Mon–Fri are the bucket keys. `date_from`/`date_to` are the week's Monday and Friday.
- Stock fields (raw object, already matching the output contract): `symbol` (ticker), `date` (that stock's actual scheduled earnings date, YYYY-MM-DD), `title` (company name), `importance` (numeric heat score, e.g. PLUG=186559, Block=178825), `time` (enum: `Pre-Market` | `After Hours` | `During Market` | `""` empty), `last_price`, `change`, `percent_change`, `volume` (latest quote snapshot). **No `logoUrl`** field exists on calendar stocks.
- **CRITICAL semantics — day bucket vs `stock.date`**: every stock carries its own `date` = the actual scheduled earnings date.
  - Future weeks (e.g. 11/09, 754 stocks; 09/14, 29 stocks): all stocks have `date ∈ [date_from, date_to]` and `date` equals the bucket key they sit in. Self-consistent — "which stocks report this week" holds.
  - Current week (08/17): today's and future-day buckets have `date` == bucket key (e.g. Thu 08-20 bucket = 52 stocks all dated 08-20, WMT included). Past-day buckets (Mon–Wed) are **forward-filled** — those stocks carry a November `date` (their *next* earnings date), not the current-week date.
  - Fully past week (08/10): 807 stocks, of which only 19 have `date` inside that week; the remaining 788 are forward-filled (dates concentrated in 11/04 ~ 11/13). The page does **not** archive past earnings — for past days/weeks it shows the next-earnings list under the queried week's Mon–Fri bucket labels (e.g. UI still says "Monday 184 reporting").
  - **Robust extraction**: filter every stock by `stock.date ∈ [date_from, date_to]`, then group by `stock.date`. This yields the true in-week reporters for future weeks (filter is a no-op), and correctly removes forward-filled next-earnings stocks for current/past weeks. The command MUST NOT return bucket contents verbatim.
- `date` switching: `?date=` within any week returns that week's Mon–Fri data (verified 08/10 and 11/09). Omitted → current week. Weekend dates normalize to their calendar week. Invalid format → 307 redirect to the current week (so the command pre-validates format and raises `INVALID_PARAM` instead of relying on the redirect). Path form `/sentiment/calendar/2026/08/10` is invalid (307).
- Data window: roughly one year (week-dropdown range 12/29/2025 ~ 12/28/2026). Far-past/far-future dates return HTTP 200 with empty stocks (valid empty result, not an error).

## Failure Signals

- **Rate limiting**: none observed across rapid and cumulative test requests — zero 429/403/CAPTCHA/redirect-to-challenge. Response headers carry no `rate-limit`/`x-ratelimit`/`retry-after`. Site is behind Cloudflare (`Server: cloudflare`, `CF-RAY`, `cf-cache-status: DYNAMIC`), sets `__cf_bm` + `anonymous_user_id` cookies but does not gate full content. Soft-degradation check: every response body contained `__NEXT_DATA__` with complete `earningsData` (stocks=754 stable, 304742~305352 bytes); no 200-with-empty/truncated/missing-fields responses. The command still applies a random 200-700ms sleep before each request and retries with backoff on 429/403/network errors and on a 200 body missing `__NEXT_DATA__` (max 3 attempts).
- Invalid `--date` format (e.g. `2026/11/09`, `abc`) → `INVALID_PARAM`. The server would 307 to the current week for such input, but the command validates format first and raises `INVALID_PARAM` instead.
- `404` → `NOT_FOUND`. Any other non-200 HTTP status → `API_ERROR`.
- A 200 page whose body lacks the `__NEXT_DATA__` marker, or whose JSON has no `pageProps.initialData.earningsData`, → `API_ERROR` (structure changed / SSR switched to client-rendering).
- Network failure / timeout → `NETWORK_ERROR` (after retries). 403/429 persisting → `RATE_LIMITED`.
- Out-of-window dates (before ~12/2025 or after ~12/2026) → HTTP 200 with empty stocks. This is a valid `week` + `days` with empty `stocks` arrays, not an error.

## Capture Assessment

- Capture as `stocktwits/list-earnings`, runtime `node`, `authRequired: not-required`. The earnings calendar is a public SSR page served to anonymous clients with a Chrome UA — no login, no browser, no API key. It is SSR-only (no JSON API), so the embedded `__NEXT_DATA__` parse is the verified, working path. Reuse value: the pre-market "who reports earnings this week" check, per-week drill-down via `--date`, and the symbol feed to `stocktwits/get-symbol-overview` / `get-symbol-posts` for details. The forward-fill filter is the core correctness requirement and is fully documented here so future maintainers do not "simplify" it away.
