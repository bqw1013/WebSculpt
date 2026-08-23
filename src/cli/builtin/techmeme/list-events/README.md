# techmeme/list-events

List upcoming tech events and earnings days from Techmeme's events calendar `https://www.techmeme.com/events`.

## Description

Techmeme's events page is a single server-rendered list of upcoming tech events — conferences, launches, demo days, and quarterly earnings days — covering roughly the next five months. This command fetches and parses that page and returns each event's date range, name, location, link, and a `featured` flag for sponsored rows. No login, no browser, no API key required.

## Parameters

| name | type | required | default | description |
|---|---|---|---|---|
| `limit` | number | no | `50` | Maximum number of events to return (1-200). The page is a single full list (~144 rows); when fewer events are available than requested, the command returns all of them and each item carries `partial:true`. |

## Return Value

The return value is a bare array of event objects:

```json
[
  {
    "date_range": "Aug 25-27",
    "name": "VIRTUAL: The Six Five Summit: AI Unleashed 2026 Featuring Marc Benioff & Enterprise AI Leaders",
    "location": "",
    "url": "/r2/www.sixfivemedia.com_summit-hkXjOAfv.htm",
    "featured": true
  }
]
```

- `date_range` — raw date text from the page, e.g. `Aug 16-19`, `Aug 19`, `Aug 30-Sep 7`. The page shows no year; early-year rows (e.g. `Jan 6-9`) refer to the next calendar year.
- `name` — event name (HTML-decoded). Earnings days are returned verbatim as `Earnings: <tickers>`; `VIRTUAL:` / `HYBRID:` prefixes are kept in the name; featured sponsor CTA spans (`REGISTER NOW`, `REGISTER FOR FREE`) are stripped.
- `location` — venue text; empty string for earnings days and VIRTUAL online events.
- `url` — Techmeme `/r2/...` redirect href (meta-refresh to the official page). Returned as-is; the command does not resolve it per event.
- `featured` — `true` when the row is a sponsored/featured listing (outer div has a `featured` class).
- `partial` — present (`true`) on every returned item only when fewer events were available than the requested `limit`.

## Usage

```bash
websculpt techmeme list-events
websculpt techmeme list-events --limit 20
websculpt techmeme list-events --limit 200   # returns all ~144 events, each with partial:true
```

## Common Error Codes

- `INVALID_PARAM` — `limit` is not an integer in 1-200 (validated on the raw string first, so `12abc` and `1.5` are rejected rather than truncated).
- `NETWORK_ERROR` — failed to reach techmeme.com (DNS/TLS/timeout).
- `API_ERROR` — the events page returned a non-2xx status (other than 403/429).
- `RATE_LIMITED` — HTTP 403/429 (blocked / rate limited; retry later).
- `DRIFT_DETECTED` — the `#events` container or the row markup changed and the parser can no longer extract events.
