# Evidence: spotify/get-podcast

This document records the research and validation evidence for the `spotify/get-podcast` command.

## Exploration Path

- Command library check: `websculpt command list spotify.com` found NO existing Spotify commands. The only cross-domain hit is `techcrunch/list-podcast-episodes` (unrelated platform). This is a brand-new platform; the whole `spotify/*` family (9 commands in the plan) is new.
- Explored in a prior workspace (assessed 2026-08-20).
- Browser automation: confirmed the browser automation protocol. Final validation ran through the websculpt daemon path (browser runtime).
- Node side (independent runtime evidence): anonymous direct calls to `/get_access_token` (403 URL Blocked), `/api/token` (400 Unauthorized, officially disallowed), and `api-partner.spotify.com/pathfinder/v2/query` without a token (401 Missing/invalid/expired access token) are all blocked. A control `/oembed` call returns 200. => runtime = browser is the only viable path.

## Verified URLs

- `https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk` — The Joe Rogan Experience show page. Loaded successfully in the browser; DOM facts and pathfinder GraphQL requests verified (title, publisher, rating 4.7/952,752 ratings, category 喜剧, full description, episode list).
- `https://api-partner.spotify.com/pathfinder/v2/query` — GraphQL endpoint. Anonymous node direct call returns 401; in-browser with the page's Bearer token returns 200 for all three queries.
- `https://open.spotify.com/api/token` — the page's internal token endpoint (`?reason=init&productType=web-player&totp=...`). Returns JSON with `accessToken` in the browser context; anonymous node direct call returns 400.
- `https://open.spotify.com/get_access_token?reason=transport&productType=web_player` — anonymous node call returns 403 URL Blocked.
- `https://open.spotify.com/oembed?url=https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk` — anonymous 200 (network control group; not used by the command).

## Structural Evidence

Data path: page-context `fetch` to `https://api-partner.spotify.com/pathfinder/v2/query` using APQ (Automatic Persisted Queries). The server accepts `{operationName, variables, extensions:{persistedQuery:{version:1, sha256Hash}}}` WITHOUT the full query text (verified 200). Request headers required: `authorization: Bearer {token}`, `app-platform: WebPlayer`, `spotify-app-version`, `content-type: application/json;charset=UTF-8`.

Three operations (verified real request bodies captured from the page):

| operation | variables | persistedQuery.sha256Hash |
|---|---|---|
| `queryShowMetadataV2` | `{uri, includeContentCapabilityTrait:false, includeEpisodeContentRatingsV2:true}` | `40202837452991ffa80ced96987bc1a937e21d5a89df5bf1fb743110e4d6e93a` |
| `queryPodcastEpisodes` | `{uri, offset, limit, includeEpisodeContentRatingsV2:true}` | `06046f9b939d56c8eb7cdbb687da938de1164c006871aec91dc26e4dc7d8eb08` |
| `internalLinkRecommenderShow` | `{uri}` | `6c369ff272a666b31fef1629c169925a1bd80f372195396c82304142cacd89e8` |

`uri` format: `spotify:show:{id}`.

Token acquisition (verified): hook `page.on('response')`, read the `/api/token` response body JSON `accessToken` (cleanest), or capture the `authorization` request header from any pathfinder request and strip the `Bearer ` prefix. Token is short-lived (~30 minutes; a captured token replayed 30 min later returned 401). Acquire fresh per execution.

`queryShowMetadataV2` response (200): `data.podcastUnionV2` (__typename Podcast):
- `name` (show title), `publisher.name`, `description` (plain text) / `htmlDescription`, `id`, `uri`
- `coverArt.sources[]` = {height, url, width} for 64 / 300 / 640
- `rating.averageRating` = {average, showAverage, totalRatings}; `canRate`
- `topics.items[]` = {title, uri} — category tags (verified: "喜剧" / spotify:genre:0JQ5DAqbMKFNr6gDrHHVKL)
- `contentRatingV2.labels[]` (EXPLICIT) — explicit flag
- `playability.playable`; `mediaType` (AUDIO/MIXED); `showTypes[]`; `saved`; `sharingInfo`
- `episodesV2` in the metadata query contains only a `RestrictedContent` placeholder (not the real list — the real list comes from queryPodcastEpisodes)
- Verified sample (Joe Rogan): name "The Joe Rogan Experience", publisher "Joe Rogan", rating average 4.654801039515046, totalRatings 952752, categories ["喜剧"], explicit EXPLICIT, covers 64/300/640.

`queryPodcastEpisodes` response (200): `data.podcastUnionV2.episodesV2`:
- Container keys: `__typename` (ContextEpisodePage), `items[]`, `pagingInfo {nextOffset}`, `totalCount` (verified 2740 for this show)
- `items[].entity` = `{_uri: "spotify:episode:{id}", data: {Episode fields}, uid}`
- `items[].entity.data` Episode fields (verified full): `id`, `name`, `description` (full plain text), `htmlDescription`, `releaseDate.isoString` (e.g. "2026-08-19T17:00:00Z") + `precision`, `duration.totalMilliseconds`, `coverArt.sources[64/300/640]`, `contentRating.label`, `contentRatingsV2.labels[]`, `mediaTypes[]` (e.g. ["VIDEO","AUDIO"]), `playability`, `previewPlayback.audioPreview.cdnUrl` (30-second mp3 preview), `podcastV2.data` (parent show), `restrictions.paywallContent`, `sharingInfo`, `type`, `uri`, `visualIdentity`
- **Important**: `items[0].entity.data.__typename` is often `"RestrictedContent"` (the featured/currently-playing episode placeholder — no id/name, only `_uri`). The command MUST skip items whose `data.__typename === "RestrictedContent"`.
- Pagination matrix (all 200, verified): offset=0/50/100/150 with limit=50 each returns the next 50 episodes (newest-first); `pagingInfo.nextOffset` advances (50→100→150→200); offset=0 limit=100 returns 100 items (limit=100 accepted); offset=0 limit=20 returns 20; offset=2690 limit=50 returns the last 50 (episodes #56…#1) with `nextOffset: null`; offset=2740 (=totalCount) returns 0 items with `nextOffset: null`. **Exhaustion signal = `pagingInfo.nextOffset === null` (or items.length === 0)**.

`internalLinkRecommenderShow` response (200): `data.seoRecommendedPodcast`:
- `items[].data` = {__typename Podcast, id, uri, name, publisher.name, coverArt.sources[64/300/640], mediaType}; `totalCount` (verified 99)

DOM fallback (verified page structure): show title, publisher, rating text (`4.7`), rating count (`(95.3万)`), category tag (`喜剧`), description ("The official podcast of comedian Joe Rogan."), episode cards (`[data-testid="episode-card"]`). Note: `h1` is the sidebar "音乐库", NOT the show title.

## Failure Signals

- Anonymous/expired token: pathfinder returns `401 {"error":{"status":401,"message":"Missing/invalid/expired access token"}}`. The token must be acquired fresh in-page. If no token can be captured, fall back to DOM.
- Anonymous node endpoints: `/get_access_token` → 403 URL Blocked (Varnish); `/api/token` → 400 Unauthorized (official policy). Browser context required.
- "加载更多单集" (Load more) button is frontend-only batching (6→12→18, no new network request) — the full list is obtained via queryPodcastEpisodes offset/limit, not by clicking.
- `RestrictedContent` placeholder as the first episode list item — must be filtered or counts will be off by one.
- Not-found show id: pathfinder returns field-level errors or an empty `podcastUnionV2`. Detect `data.podcastUnionV2` absence / errors → NOT_FOUND. The show page may also render a 404/empty body.
- Token expiry (~30 min) means tokens must never be cached/persisted.
- Rate limiting: keep 200-700ms random sleeps between pathfinder calls; command target total ≤10s.

## Capture Assessment

Yes, capture `spotify/get-podcast`. It is the hub command of the Spotify podcast family — search, chart, category and hub outputs all point to show URLs, and show metadata + full episode list is the highest-frequency need. The path is fully verified end-to-end (three APQ-hash GraphQL queries, offset/limit pagination, RestrictedContent filtering, DOM fallback). No existing command covers Spotify. Browsing public shows needs no login.
