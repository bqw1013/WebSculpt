# Context

## Precipitation Background (Why This Command Exists)

Spotify is one of the largest podcast platforms, but the WebSculpt library had no Spotify commands. Keyword search is the base discovery entry point for podcast shows and episodes — search results feed `spotify/get-podcast` and `spotify/get-episode`. Precipitated as part of the Spotify podcast command pool (2026-08-20), after the `spotify-comprehensive` explore verified the anonymous search path and the GraphQL query names.

## Value Assessment

Keyword search is the highest-frequency entry into the podcast catalog. Reusable for research on AI, tech, history, economy, investment, media, etc. The command preserves native fields (publisher, cover, parent show, publish date, duration, explicit flag) for cross-platform comparison, and returns a stable `id`/`url` that downstream `spotify/get-podcast` / `spotify/get-episode` accept.

## Page Structure

- Search URL: `https://open.spotify.com/search/{q}/podcastAndEpisodes` (Podcasts & Shows tab) and `https://open.spotify.com/search/{q}/episodes` (episodes sub-page).
- Data: `POST https://api-partner.spotify.com/pathfinder/v2/query`, APQ persisted queries:
  - `searchPodcasts` (SHA `0195d9f61b43606d490bca64c3456e3593528cea6cc05c7e822c7c42beed0f4e`) → `data.searchV2.podcasts{items[], totalCount, pagingInfo{limit,nextOffset}}`.
  - `searchFullEpisodes` (SHA `d54e35fafe7520cb53883b86d012911cbad75c14ac079a917951c24cdb07c60f`) → `data.searchV2.episodes{...}`.
- Item wrappers: `PodcastResponseWrapper.data{name, publisher:{name}, uri:"spotify:show:{id}", coverArt.sources[64/300/640]}`; `EpisodeResponseWrapper.data{id, name, uri, coverArt.sources, releaseDate{isoString}, duration{totalMilliseconds}, podcastV2.data{name,uri,publisher}}`.
- Pagination: `offset`/`limit` vars + `pagingInfo.nextOffset`. The `podcastAndEpisodes` page does NOT lazy-load on scroll (verified); the podcasts shelf shows a fixed 10 cards with "显示全部 / Show all" → `/search/{q}/podcasts`.

## Environment Dependencies

- WebSculpt browser runtime: attaches the user's Chrome; reuses the session token that makes the app's pathfinder calls work. Public search needs no login.
- The command captures the app's own `searchPodcasts`/`searchFullEpisodes` responses and request headers on page load, so it does not need to mint its own token.
- Polite pacing: single navigation per invocation; pagination re-issues sleep 250–500ms between requests; total requests bounded by `limit` (page size 30).
- A cookie-consent banner (`#onetrust-accept-btn-handler`) can appear and is dismissed automatically.

## Failure Signals

- Search page never fires the search GraphQL queries (consent wall not dismissed / page redesigned / region block) → `DRIFT_DETECTED` after ~25s.
- `searchPodcasts`/`searchFullEpisodes` response missing → `DRIFT_DETECTED`; the GraphQL operation names or response bucket path changed.
- Re-issued query returns field-level `errors` (e.g. trimmed variables) → `GRAPHQL_ERROR`.
- Anonymous node-side calls return 403/400/401 — do not attempt a node runtime; the browser path is required.

## Repair Clues

- If the app stops firing both queries on `/podcastAndEpisodes`, navigate to `/search/{q}/episodes` (fires `searchFullEpisodes` only) or `/search/{q}/podcasts` for the shows shelf, and adjust which buckets are awaited.
- If `resp.request().allHeaders()` no longer exposes `authorization`, the token may move to a cookie or a different header name — capture the full header map and re-pick.
- Fallback data source: DOM parsing of `a[href^="/show/"]` / `a[href^="/episode/"]` cards (`[data-encore-id="cardTitle"]`, `[data-encore-id="cardSubtitle"]`), as the removed 2026-07-26 draft did.
- `totalCount` for episodes is capped at 1000 by the server; treat it as an upper bound, not an exact count.
