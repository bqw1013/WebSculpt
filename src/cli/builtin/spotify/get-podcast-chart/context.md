# Context

## Precipitation Background (Why This Command Exists)

The Spotify podcast family needed an official discovery surface for "what's hot right now". Spotify's standalone charts site (charts.spotify.com) forces login, so the in-app 播客排行榜 page — reachable anonymously from the podcast hub — is the real anonymous chart. It is a fixed top-20 list of shows with no pagination or parameters, which makes it the simplest command in the family and a natural feeder of show ids/urls into spotify/get-podcast.

## Value Assessment

High reuse: it is the canonical anonymous "top podcasts" list on Spotify, the starting point for exploring the platform's podcast inventory. Fixed 20-item output, zero parameters, single page load — cheap to run, easy to maintain. Its output (show id/url) is consumed by spotify/get-podcast.

## Page Structure

- URL: `https://open.spotify.com/genre/0JQ5DAB3zgCauRwnvdEQjJ`
- Data source: the page's own pathfinder GraphQL POSTs to `https://api-partner.spotify.com/pathfinder/v2/query`, operations `browsePage` (`spotify:page:0JQ5DAB3zgCauRwnvdEQjJ`) and `browseSection` (`spotify:section:0JQ5DAob0LrW8pqFzVs4ut`).
- Item shape (`sectionItems.items[]`): `{ content: { data: { __typename: "Podcast", name, publisher: { name }, coverArt: { sources: [{height,url}...] }, uri: "spotify:show:{id}" } }, uri }`.
- Rank = array index + 1 (no explicit rank field). No pagination (`nextOffset: null`). Cover = largest source (640px).
- DOM fallback: `a[href*="/show/"]` anchors in document order; card text splits into title/publisher lines; card image is the cover.

## Environment Dependencies

- Requires the websculpt daemon with an attached Chrome (browser runtime).
- **Anonymous context is mandatory**: the command calls `page.context().browser().newContext()` and loads the chart in that incognito context. A logged-in account in some markets gets an empty chart (`items: []`, `totalCount: 0`), so the default logged-in page must NOT be used for the data. The incognito context is opened, the pathfinder response is captured, and the context is closed immediately (open-and-close-fast, ~1-2s window) to minimize disruption.
- No login, no API key. Polite pacing: one page load per run with a 200-700ms pre-navigation jitter and a short settle sleep; total run time bounded (~10s).

## Failure Signals

- `browsePage`/`browseSection` not captured within ~10s → the SPA did not boot (login wall, geo block, site change) → DOM fallback.
- DOM fallback yields zero anchors → return `{ entries: [] }` (legitimate empty market) or, if combined with a changed page title, treat as drift in a maintain pass.
- `browser.newContext()` unavailable → `DRIFT_DETECTED`.
- Chart item shape changes (missing `name`/`publisher`/`coverArt`/`uri`) → every entry would come back null; that is the drift signal to re-explore.

## Repair Clues

- Re-run the anonymous-context fetch-hook probe (browsePage/browseSection) to get the current response shape.
- The section URI (`spotify:section:0JQ5DAob0LrW8pqFzVs4ut`) and page URI (`spotify:page:0JQ5DAB3zgCauRwnvdEQjJ`) are stable identifiers; if the page stops returning the section, fetch `browsePage` and walk `browse.sections.items[].sectionItems.items`.
- If Spotify re-introduces a login wall on the genre page, the chart may need a logged-in fallback or a different entry point (e.g. from the podcast hub card).
