# Context

## Precipitation Background (Why This Command Exists)

TechCrunch runs flagship live events (Disrupt, StrictlyVC, Sessions, Startup Battlefield) that are a primary offline-community signal for the startup/VC scene. The events page `/events/` is a first-class nav entry, and no existing command covered it (`get-latest`/`get-feed` cover the article stream, `get-topic` covers tags, `get-article` fetches a single article). This command lists event cards so a user can monitor what's coming up and what already happened.

## Value Assessment

- Single reusable call replaces manually opening `/events/` and reading the page.
- `type` + `limit` make it scriptable: monitor upcoming events, or audit the past archive.
- Reuses the same public WordPress REST API channel as `get-feed` / `get-article` / `get-popular` (consistent, no new auth/browser dependency).

## Page Structure

- `https://techcrunch.com/events/` — server-rendered page with two blocks:
  - **Upcoming Events**: `<h2>Upcoming Events</h2>` + `.wp-block-post-template` with `.loop-card--post-type-tc_event` cards (`.loop-card__title`, `.loop-card__date`, `.loop-card__location`).
  - **Past Events**: `<h2>Past Events</h2>` + `table.wp-block-tc23-past-events__listing` (`.listing-title-link`, `.listing-meta-date`, `.listing-meta-location`).
- **The site's HTML pagination is broken**: `/events/page/2/` … `/events/page/13/` all return byte-identical past-events content. The past-events block's AJAX endpoint (`wp-json/tc/blocks/past-events/filter`) also ignores pagination params.
- **Chosen data source — WP REST API**:
  - Upcoming: `GET /wp-json/wp/v2/tc_event?orderby=upcoming_events&per_page=100&page=N` — returns exactly the site's upcoming set (custom orderby), ascending by start date. HTTP 400 beyond the last page.
  - Past/all: `GET /wp-json/wp/v2/tc_event?per_page=100&page=N` — 373 total events (4 pages). Past = `tc_event_start < today`, sorted descending by start date (matches the site's Past table).
  - Venues: `GET /wp-json/wp/v2/tc_event_venues?include=id1,id2,...&_fields=id,slug,meta` — meta `_tc_venue_city` / `_tc_venue_state` / `_tc_venue_country`.
- Per-block formatting (reproduced to match the page):
  - Dates: upcoming cards use full month names (`August 19, 2026`, `October 13 – 15, 2026`); the past table uses abbreviated months (`Jun 18, 2026`, `Jun 17 – 20, 2026`). En dash for ranges.
  - Locations: upcoming cards show city (+ `, ` + state) whenever a city exists (`Sydney`, `San Francisco, CA`); the past table shows location only when the venue has a state (`El Segundo, CA`), so international venues with no state (Paris, Athens, Tokyo) render no location.

## Environment Dependencies

- Public WordPress REST API — no login, no browser.
- Runtime: `node` (global `fetch`). TechCrunch serves its homepage to plain HTTP clients (verified: plain fetch returns HTTP 200).
- Polite pacing: random 200-700ms sleep before each request. At most 5 requests per invocation (upcoming: 1 + venues; past/all: 4 event pages + venues).

## Failure Signals

- API returns non-array → `DRIFT_DETECTED`.
- `orderby=upcoming_events` removed → HTTP 400 `rest_invalid_param` → `DRIFT_DETECTED`.
- Non-2xx (except the pagination-exhaustion 400) → `API_ERROR`.
- 403/429 → `RATE_LIMITED`.
- Empty result for a type → legitimate `{ events: [], count: 0, partial: true }`, not an error.

## Repair Clues

- If the `orderby=upcoming_events` custom parameter disappears, upcoming can be rebuilt client-side: filter all events by `tc_event_start >= today` and sort ascending by start date (verified to match `orderby=upcoming_events` exactly on 2026-08-14: 4 events, same set, same order).
- If the REST API ever closes, fall back to parsing the `/events/` HTML blocks (Upcoming loop-cards + Past table) — but past events will be capped at the 10 rows the page renders, and pagination is a no-op.
- Venue location uses the first venue that has a city; if venue resolution changes, the `_tc_venue_city` / `_tc_venue_state` meta keys are the current source of truth.
