# Evidence: techcrunch/list-events

This document records the research and validation evidence for the `techcrunch/list-events` command.

## Exploration Path

- Library check: `websculpt command list techcrunch` shows existing commands `get-latest`, `get-article`, `get-author`, `get-feed`, `get-popular`, `get-topic`, `list-podcast-episodes`, `search` (all user source, node runtime, no browser, no login). No name conflict with `techcrunch/list-events`.
- Source plan: the command-family plan, section "6. list-events" (treated as a design suggestion, not a strict contract). It proposed parsing the server-rendered `/events/` HTML (Upcoming + Past blocks) with classic pagination `/events/page/2/`.
- Contract consulted: the node runtime contract before drafting `command.js`.
- All structural facts below were re-verified first-hand on 2026-08-14 via a Playwright CLI browser attach to the user's Chrome plus curl from this machine. Where the plan and first-hand measurement disagreed, measurement wins and the deviation is recorded below.

## Verified URLs

- https://techcrunch.com/events/ (server-rendered events page; two blocks: "Upcoming Events" and "Past Events")
- https://techcrunch.com/events/page/2/ (HTML pagination; **serves identical content to page 1 — pagination is a NO-OP**)
- https://techcrunch.com/events/page/13/ (last archive page; still identical past-events content — confirms HTML pagination is broken)
- https://techcrunch.com/wp-json/wp/v2/tc_event (WordPress REST API for the `tc_event` custom post type; 373 total events, `per_page` up to 100, 4 pages)
- https://techcrunch.com/wp-json/wp/v2/tc_event?orderby=upcoming_events&per_page=100 (returns ONLY the upcoming events, in the exact order of the site's Upcoming block; X-WP-Total: 4)
- https://techcrunch.com/wp-json/wp/v2/tc_event_venues (venue post type; 121 venues, meta holds `_tc_venue_city` / `_tc_venue_state` / `_tc_venue_country`)
- https://techcrunch.com/wp-json/tc/blocks/past-events/filter (the past-events block's own AJAX endpoint; returns the same 10 rows as the page, no pagination support)

## Structural Evidence

### Data source decision (API vs HTML)

The plan assumed HTML parsing with `/events/page/N/` pagination. First-hand measurement disproves this:

| Source | upcoming | past | pagination | structured | chosen |
|---|---|---|---|---|---|
| `/events/` HTML (Upcoming + Past blocks) | 4 cards | 10 rows | **broken** — `/events/page/2/` and `/events/page/13/` return identical content | class-based | no |
| `wp-json/tc/blocks/past-events/filter` | n/a | same 10 rows | none (`page`/`per_page`/`paged` params ignored) | HTML fragment | no |
| `wp-json/wp/v2/tc_event` | exact site set via `orderby=upcoming_events` | all 373, filter by start date | `per_page` up to 100, 4 pages | JSON | **yes** |

The HTML page's own pagination is a no-op: `curl https://techcrunch.com/events/page/2/` returns byte-for-byte the same past-events listing as `/events/` (only `<title>`, canonical, and prev/next `<link>` meta change). The past-events block only ever renders 10 rows server-side and its AJAX endpoint ignores pagination params. To satisfy the command contract (`limit` up to 100, `type=past` must paginate, `partial` on exhaustion), the WP REST API `tc_event` post type is the correct source. This is a recorded deviation from the plan.

### Endpoints

1. Upcoming events:
   - `GET /wp-json/wp/v2/tc_event?orderby=upcoming_events&per_page={n}&page={p}&_fields=id,slug,link,title,meta.tc_event_start,meta.tc_event_end,meta.tc_event_venues`
   - Returns ONLY upcoming events (X-WP-Total: 4 on 2026-08-14), in the same order as the site's Upcoming block (verified: Stripe x Startup Battlefield, StrictlyVC NYC 2026, TechCrunch Disrupt 2026, TechCrunch Founder Summit 2026 — ascending by `tc_event_start`).
   - `orderby=upcoming_events` is a custom registered orderby; HTTP 400 (`rest_post_invalid_page_number`) when page > last page (stream exhausted).
2. Full event list (for `past` / `all`):
   - `GET /wp-json/wp/v2/tc_event?per_page=100&page={p}&_fields=id,slug,link,title,meta.tc_event_start,meta.tc_event_end,meta.tc_event_venues`
   - Default order is publish-date desc; 373 total, 4 pages. Past events are filtered client-side by `tc_event_start < today` and sorted by `tc_event_start` descending — this reproduces the site's Past Events table order exactly (verified first 10 rows).
3. Venue resolution:
   - `GET /wp-json/wp/v2/tc_event_venues?include={id1,id2,...}&_fields=id,slug,meta`
   - Batch `include` works (verified with 10 ids). Each venue meta holds `_tc_venue_city` (e.g. "San Francisco"), `_tc_venue_state` (e.g. "CA"), `_tc_venue_country`.
   - 207 of 373 events have no `tc_event_venues` → `location: null`.

### Event field mapping

- `title.rendered` — HTML-encoded title; decode to plain text.
- `link` — canonical event URL `https://techcrunch.com/events/{slug}/`.
- `meta.tc_event_start` / `meta.tc_event_end` — ISO `YYYY-MM-DDTHH:MM:SS`; always present (0 of 373 missing).
- Status boundary: `tc_event_start >= today` → `upcoming`, else `past`. On 2026-08-14 this yields exactly the same 4-event upcoming set that `orderby=upcoming_events` returns.
- Date display reproduces the site per block (site uses two formats):
  - upcoming cards: full month names + en-dash, e.g. `August 19, 2026`, `October 13 – 15, 2026`.
  - past table: abbreviated month names + en-dash, e.g. `Jun 18, 2026`, `Jun 17 – 20, 2026`.
  - Cross-month/cross-year ranges render both months/years, e.g. `Feb 26 – Mar 1, 2018`, `Dec 30, 2017 – Jan 2, 2018` (site style inferred from same-month examples; cross-month rows exist in the archive but are not on page 1 of the past table).
- Location display reproduces the site per block (site renders the two blocks differently):
  - upcoming cards always show location when a venue city exists: `city` or `city, state` (e.g. `Sydney`, `New York, New York`, `San Francisco, CA`).
  - past table shows location only when the venue has a state: `city, state` (e.g. `El Segundo, CA`, `San Francisco, CA`, `Berkeley, CA`); international venues with no state (Paris, Athens, Tokyo) render NO location.
- Output order: upcoming ascending by start date; past descending by start date; `all` = upcoming first, then past (task requirement).

### Output contract

`{ events: Array<{name, url, date, location, status: "upcoming"|"past"}>, count, partial }`
- `date` and `location` may be `null` (location is null when the event has no resolvable venue, or for a past event whose venue has no state — matching the site).
- `partial` is `true` when fewer events are available than the requested `limit` (e.g. `type=upcoming limit=100` returns 4 with `partial:true`).
- Requests are serial with a randomized 200-700ms delay before each (polite pacing), matching the site-wide convention.

## Failure Signals

- HTTP 200 + non-array body on any endpoint → `DRIFT_DETECTED` (response shape changed).
- Non-2xx from the API (other than the 400 that signals pagination exhaustion) → `API_ERROR` with status.
- HTTP 403/429 → `RATE_LIMITED`.
- Fetch throw / timeout → `NETWORK_ERROR`.
- `orderby=upcoming_events` no longer recognized → API returns 400 `rest_invalid_param`; treated as `DRIFT_DETECTED` (site removed the custom orderby).
- Empty result for a type is a legitimate success state: `{ events: [], count: 0, partial: true }`, not an error.
- HTML pagination being broken is a known site behavior, NOT a command failure (command uses the API instead).
- Polite pacing: public API, stable; random 200-700ms sleep before every request; at most 5 requests per invocation (past/all). No 429/403 observed during verification, but sustained parallel bursts are tested during capture.

## Capture Assessment

Captured as `techcrunch/list-events`: lists TechCrunch events (Disrupt, StrictlyVC, Sessions, etc.) with `type` filtering (upcoming/past/all) and `limit` up to 100 — a content form not covered by existing commands. The plan's HTML-parsing-with-pagination assumption was disproven by first-hand measurement (pagination is a no-op); the correct source is the public WordPress REST API `tc_event` post type, which reproduces both site blocks exactly and supports real pagination. Node runtime, no auth, no browser. Output is a flat array of event cards (`name, url, date, location, status`) plus `partial` when the list is exhausted, matching the approved contract. Proceed to capture.
