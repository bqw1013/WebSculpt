# Evidence: spotify/search

This document records the research and validation evidence for the `spotify/search` command.

## Exploration Path

- `websculpt command list spotify` returned no real spotify command; only two temp explore probes (`spotify/zz-chart-probe`, `spotify/zz-search-probe`) that were removed after exploration.
- A stale, unregistered `spotify/search` (2026-07-26, DOM-extraction path, type `all/show/episode`) existed on disk at a prior local command path and was removed via `websculpt command remove` before capture.
- The search path passed explore assessment (2026-08-20).
- Browser automation protocol consulted: browser automation protocol confirmed.
- Exploration used `@playwright/cli` (attach to the user's Chrome) and a daemon-based temp probe command; both verified the same page behaviors.

## Verified URLs

- https://open.spotify.com/search/joe%20rogan/podcastAndEpisodes — "Podcasts & Shows" search tab; fires `searchPodcasts` + `searchFullEpisodes` (+ `searchTopResultsList`) on load.
- https://open.spotify.com/search/joe%20rogan/episodes — episodes sub-page; fires ONLY `searchFullEpisodes` + `searchTopResultsList` (no `searchPodcasts`).
- https://api-partner.spotify.com/pathfinder/v2/query — GraphQL endpoint; anonymous POST returns 401 `Missing/invalid/expired access token`; callable from page context with the app session token.
- https://open.spotify.com/get_access_token — anonymous GET returns 403 `URL Blocked`.
- https://open.spotify.com/api/token — anonymous GET returns 400 `Unauthorized request` (usage prohibited under Developer Terms).

## Structural Evidence

- Anonymous node-side calls are all blocked (`get_access_token` 403, `api/token` 400, pathfinder 401) → command must run in a browser context and reuse the page session token.
- The search page (`/search/{q}/podcastAndEpisodes`) issues two search GraphQL operations through `POST https://api-partner.spotify.com/pathfinder/v2/query`, using APQ persisted queries:
  - `searchPodcasts` — SHA256 `0195d9f61b43606d490bca64c3456e3593528cea6cc05c7e822c7c42beed0f4e`
    - variables (exact, verified): `{includePreReleases:false, includeAlbumPreReleases:false, numberOfTopResults:20, searchTerm, offset, limit:30, includeAudiobooks:true, includeAuthors:false, includeEpisodeContentRatingsV2:true}`
    - response: `data.searchV2.podcasts{items[], totalCount (real, e.g. 567 for "joe rogan"), pagingInfo{limit:30, nextOffset:30}, query}`
    - item wrapper `PodcastResponseWrapper.data{name, publisher:{name}, uri:"spotify:show:{id}", coverArt.sources[{height:64|300|640, url}], mediaType, topics}` — no direct `id` field; show id extracted from `uri`.
  - `searchFullEpisodes` — SHA256 `d54e35fafe7520cb53883b86d012911cbad75c14ac079a917951c24cdb07c60f`
    - variables (exact, verified): `{searchTerm, offset, limit:30, includeEpisodeContentRatingsV2:true}`
    - response: `data.searchV2.episodes{items[], totalCount (capped at 1000), pagingInfo{limit:30, nextOffset:30}}`
    - item wrapper `EpisodeResponseWrapper.data{id (direct), name, uri:"spotify:episode:{id}", coverArt.sources[64/300/640], releaseDate{isoString, precision:"MINUTE"}, duration{totalMilliseconds}, contentRating{label:"EXPLICIT"|...}, podcastV2.data{name, uri:"spotify:show:{id}", publisher:{name}}}`
  - `searchTopResultsList` — used by the "全部" (all) tab, out of scope for this command.
- Pagination is **GraphQL offset-based**, not UI scroll: the `podcastAndEpisodes` page returns `pagingInfo.nextOffset` (e.g. 30 after limit=30), and scrolling the page to the bottom fires **no** additional `searchPodcasts`/`searchFullEpisodes` requests (verified: `scrollNewRequests` empty; the podcasts shelf shows a fixed 10 cards with a "显示全部 / Show all" link → `/search/{q}/podcasts`).
- type filtering: `all` = issue both queries (the `/podcastAndEpisodes` page fires both); `podcasts` = `searchPodcasts` only; `episodes` = `searchFullEpisodes` only (maps to the `/search/{q}/episodes` sub-page, which fires only `searchFullEpisodes`).
- Real samples (2026-08-20): podcast item `The Joe Rogan Experience` / publisher `Joe Rogan` / `spotify:show:4rOoJ6Egrf8K2IrywzwOMk`; episode item `#2542 - Steve Hilton` / id `2NqAFyrVQXlS3mOfmA4BKi` / date `2026-08-19T17:00:00Z` / durationMs `10772201` / show `The Joe Rogan Experience`.

## Failure Signals

- `BROWSER_ATTACH_REQUIRED` (infra): the websculpt daemon has no active CDP session — Chrome remote debugging not enabled/restarted.
- `DRIFT_DETECTED`: the search page does not fire the search GraphQL queries within ~20s (e.g. a consent wall or a redesigned page); or `searchPodcasts`/`searchFullEpisodes` response is missing.
- `GRAPHQL_ERROR`: a re-issued query returns field-level errors (trimmed variables or schema drift); command must re-issue with the exact app variables.
- 401 on re-issue: the page session token is invalid/expired; re-navigating to the search page refreshes the token.
- Empty results are a valid outcome (0 podcasts / 0 episodes) → return empty arrays with `partial: true`, not an error.

## Capture Assessment

- Capture as `spotify/search` (browser runtime). The command reuses the app's own GraphQL path (APQ hashes + session headers) rather than DOM scraping, which is deterministic and preserves native fields (publisher, cover, date, duration, parent show). Parameters `query` / `type` / `limit` map cleanly to query selection and offset pagination. Browsing public search needs no login.
