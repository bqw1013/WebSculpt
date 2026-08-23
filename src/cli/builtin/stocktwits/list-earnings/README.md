# stocktwits/list-earnings

## Description

List the Stocktwits earnings calendar — which companies report earnings in a given week, grouped by day (Mon-Fri). This is the "who reports this week" pre-market checklist, sourced from `stocktwits.com/sentiment/calendar`'s embedded SSR JSON (there is no public JSON API for it).

An optional `--date YYYY-MM-DD` picks the week: pass **any** day inside the target week (weekend dates normalize to their calendar week); omitted returns the current week.

Each stock carries its **real scheduled earnings date** (`stock.date`), company name, an importance heat score, the session time, and a latest price snapshot. The command correctly handles the site's forward-fill behavior for past/current partial weeks (see Return Value notes) so the output always reflects stocks actually reporting inside the queried week. No login, no browser, no API key. Runtime: `node`.

## Parameters

| name | required | default | description |
|------|----------|---------|-------------|
| `date` | no | current week | Any day inside the target week, `YYYY-MM-DD` (e.g. `2026-11-09` selects the week of Nov 9-13). Weekend dates normalize to their calendar week. Invalid format raises `INVALID_PARAM`. |

## Return Value

```json
{
  "week": { "from": "2026-11-09", "to": "2026-11-13" },
  "days": [
    {
      "date": "2026-11-09",
      "day": "Monday",
      "stocks": [
        {
          "symbol": "PLUG",
          "date": "2026-11-09",
          "title": "Plug Power Inc",
          "importance": 123456,
          "time": "After Hours",
          "last_price": 12.34,
          "change": 0.56,
          "percent_change": 4.75,
          "volume": 1234567
        }
      ]
    }
  ]
}
```

Field notes:

- `week.from` / `week.to`: the queried week's Monday and Friday (as resolved by the server). Out-of-window dates (outside the ~1-year data window, roughly 12/2025 ~ 12/2026) still return a week but with empty `stocks` — a valid empty result, not an error.
- `days`: one entry per calendar day from `week.from` to `week.to` (normally Mon-Fri), in order. A day with no reporters has an empty `stocks` array.
- `stock.date`: the stock's **actual scheduled earnings date** — the grouping key. It always falls inside `[week.from, week.to]`.
- `time`: `"Pre-Market"` | `"After Hours"` | `"During Market"` | `""` (empty string for sessions without a designated window).
- `importance`: numeric heat score (higher = more attention on Stocktwits).
- `last_price` / `change` / `percent_change` / `volume`: latest quote snapshot (may be null/0 for non-US or pre-IPO names).

### Forward-fill filter (important)

The site's SSR buckets for **past days of the current week** and for **fully-past weeks** are forward-filled with each stock's *next* earnings date (which lies outside the queried week, e.g. in November) — the page does not archive past earnings. The command filters every stock by `stock.date ∈ [week.from, week.to]` and then groups by `stock.date`, so the output always shows stocks that actually report inside the queried week. Future weeks are self-consistent and unaffected.

## Usage

```
websculpt stocktwits list-earnings
websculpt stocktwits list-earnings --date 2026-11-09
websculpt stocktwits list-earnings --date 2026-08-15
websculpt stocktwits list-earnings --date 2026-08-10
```

## Common Error Codes

| code | meaning |
|------|---------|
| `INVALID_PARAM` | `--date` is not a valid `YYYY-MM-DD` calendar date (e.g. `2026/11/09`, `abc`, `2026-02-30`). |
| `NOT_FOUND` | The calendar page returned 404. |
| `RATE_LIMITED` | The endpoint returned 403/429 and stayed blocked after 3 retries. |
| `API_ERROR` | Unexpected HTTP status, or a 200 page without `__NEXT_DATA__` / `earningsData` (structure changed). |
| `NETWORK_ERROR` | Fetch failed / timed out / network unreachable (after 3 retries). |
