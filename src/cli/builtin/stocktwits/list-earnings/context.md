# Context

## Precipitation Background (Why This Command Exists)

The stocktwits domain had zero commands at explore time. The earnings calendar is a core "who reports this week" pre-market product and is **SSR-only** — the page references only `api.stocktwits.com/api/2/` for its side widgets, with no independent earnings-calendar JSON API. Exploration (assess `passed`, Confirmation 2026-08-20) verified the `__NEXT_DATA__` extraction path and corrected the plan's assumptions: calendar stocks have **no `logoUrl`** field, the path form `/sentiment/calendar/2026/08/10` is invalid (307), and — most importantly — past/current partial weeks are **forward-filled** with each stock's *next* earnings date rather than archived history.

## Value Assessment

Reusable for "which companies report earnings this week / a given week", per-week drill-down via `--date`, and as a symbol feed into `stocktwits/get-symbol-overview` / `stocktwits/get-symbol-posts` for detail. Anonymous static SSR, no rate limiting measured across ~43 requests, so the command is cheap and stable. Reuse frequency: on-demand (weekly, pre-market).

## Page Structure

- Endpoint: `https://stocktwits.com/sentiment/calendar?date=YYYY-MM-DD` (HTTP 200, ~305KB, anonymous, Chrome UA). Omit `?date=` for the current week.
- Data: `<script id="__NEXT_DATA__" type="application/json">` → `props.pageProps.initialData.earningsData`.
- `earningsData`: `{ country, activeWeek?, date_from (Mon), date_to (Fri), earnings: { "<YYYY-MM-DD>": { day, month, year, date_number, stocks: [...] } } }`.
- Stock fields: `symbol`, `date` (actual scheduled earnings date), `title`, `importance` (numeric heat score), `time` (`Pre-Market` | `After Hours` | `During Market` | `""`), `last_price`, `change`, `percent_change`, `volume`. No `logoUrl`.
- **Forward-fill semantics**: `stock.date` is the stock's real earnings date, independent of the day bucket it sits in. For current-week past days and fully-past weeks the buckets are forward-filled (next earnings date, often in November), NOT archived history. Correct extraction = filter `stock.date ∈ [date_from, date_to]`, then group by `stock.date`. Do not return bucket contents verbatim.
- `?date=` semantics: any date in a week selects that week's Mon-Fri; weekend dates normalize to their calendar week; invalid dates 307-redirect to `/sentiment/calendar` (current week) — the command pre-validates and raises `INVALID_PARAM` instead.
- Data window: ~1 year (week dropdown 12/29/2025 ~ 12/28/2026). Far dates → 200 with empty stocks (valid empty result).

## Environment Dependencies

- No login, no browser, no API key; anonymous HTTP 200 with a standard Chrome User-Agent.
- Polite pacing: random 200-700ms sleep before every request. The endpoint measured unlimited in testing (no 429/403, no rate-limit headers), but the sleep keeps the command conservative.
- Soft-degradation guard: retries (up to 3) when a 200 body lacks the `__NEXT_DATA__` marker.
- Node runtime: uses global `fetch` + `AbortController` (Node 18+). No third-party modules.

## Failure Signals

- `429`/`403` → `RATE_LIMITED` after 3 retries (not observed in practice; defensive).
- Non-200 other than 404 → `API_ERROR`. 404 → `NOT_FOUND`.
- 200 page without `__NEXT_DATA__`, or JSON without `pageProps.initialData.earningsData` → `API_ERROR` (structure changed, e.g. SSR → client-rendering).
- Network failure / timeout → `NETWORK_ERROR` after 3 retries.
- Invalid `--date` format → `INVALID_PARAM` (never rely on the server 307).
- Out-of-window date → valid `week` + `days` with empty `stocks`, not an error.

## Repair Clues

- If the SSR marker or path changes, re-derive from a fresh fetch of `/sentiment/calendar`. The regex expects `<script ... id="__NEXT_DATA__" ...>` and `props.pageProps.initialData.earningsData`.
- If Stocktwits adds a JSON earnings API, the command could switch to it — but keep the same output shape (`week` + `days` with filtered, date-grouped stocks).
- If stock fields change (e.g. `logoUrl` appears), add the key to `STOCK_FIELDS` in `command.js` and update the manifest description + README output example.
- The forward-fill filter is the core correctness requirement. If a future maintainer "simplifies" it to return bucket contents verbatim, past/current weeks will silently show November-dated stocks inside a past week — re-verify against `?date=` of a past week (e.g. 2026-08-10).
