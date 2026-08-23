# techcrunch/list-events

List TechCrunch events (Disrupt, StrictlyVC, Sessions, etc.) from the public WordPress REST API that backs the events page `https://techcrunch.com/events/`.

## Description

The `/events/` page shows two server-rendered blocks: **Upcoming Events** and **Past Events**. This command lists them via the WP REST API (`tc_event` post type), which reproduces both blocks exactly and supports real pagination — the site's own HTML pagination (`/events/page/N/`) is a no-op and serves identical content on every page, so the API is used instead.

- `--type upcoming` (default): future events, ascending by start date (matches the site's Upcoming block).
- `--type past`: finished events, descending by start date (matches the site's Past table).
- `--type all`: upcoming first, then past.

No authentication required. Event detail pages are custom-built per event and not covered by this command.

## Parameters

| name | type | required | default | description |
|---|---|---|---|---|
| `type` | string enum | no | `upcoming` | Which events to list: `upcoming` (即将举办), `past` (已结束), `all` (全部, upcoming first). |
| `limit` | number | no | `20` | Maximum number of events to return (1-100). Past events paginate internally; `partial=true` when the list is exhausted. |

## Return Value

```json
{
  "events": [
    {
      "name": "TechCrunch Disrupt 2026",
      "url": "https://techcrunch.com/events/techcrunch-disrupt/",
      "date": "October 13 – 15, 2026",
      "location": "San Francisco, CA",
      "status": "upcoming"
    }
  ],
  "count": 1,
  "partial": false
}
```

- `events` — array of event cards.
  - `name` — event title (HTML-decoded).
  - `url` — canonical event URL.
  - `date` — human-readable date string matching the site block's style: full month names for upcoming (e.g. `August 19, 2026`), abbreviated months for past (e.g. `Jun 18, 2026`); ranges use an en dash (`October 13 – 15, 2026`). `null` if no date.
  - `location` — venue city (+ state) when the card shows one: upcoming cards always show city when present; the past table shows location only when the venue has a state (international venues without a state render none, matching the site). `null` otherwise.
  - `status` — `"upcoming"` or `"past"`.
- `count` — number of events returned.
- `partial` — `true` when fewer events were available than the requested `limit` (e.g. `--type upcoming --limit 100` returns ~4 events with `partial:true`).

## Usage

```bash
websculpt techcrunch list-events
websculpt techcrunch list-events --type upcoming
websculpt techcrunch list-events --type past --limit 50
websculpt techcrunch list-events --type all --limit 10
```

## Common Error Codes

- `INVALID_PARAM` — `type` is not one of `upcoming` / `past` / `all`, or `limit` is not an integer in 1-100.
- `NETWORK_ERROR` — failed to reach the TechCrunch API.
- `API_ERROR` — TechCrunch API returned a non-2xx status (other than the 400 that signals pagination exhaustion).
- `RATE_LIMITED` — HTTP 403/429 (rate limited / blocked; retry later).
- `DRIFT_DETECTED` — API response shape changed or the `orderby=upcoming_events` parameter was removed.
