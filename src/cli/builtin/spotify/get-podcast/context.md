# Context

## Precipitation Background (Why This Command Exists)

The podcast show (URL `/show/{id}`) is the core entity of the Spotify podcast family. Search, chart, category and hub outputs all point to show URLs, and "show metadata + full episode list" is the highest-frequency need. The command was precipitated as the first capture of the `spotify/*` family (9 commands planned), built on the verified explore path in `a prior explore workspace`.

## Value Assessment

- High reuse: every discovery entry point (search/chart/category/hub) funnels into `spotify/get-podcast` for details.
- Saves the user from manually browsing Spotify's JS-heavy page and reconstructing the episode list.
- Establishes the page-context GraphQL + APQ-hash + fresh-token pattern that `spotify/get-episode`, `spotify/search` and other family commands reuse.

## Page Structure

- Show page: `https://open.spotify.com/show/{22-char-id}`.
- Data is NOT in the HTML shell (SPA); it comes from `POST https://api-partner.spotify.com/pathfinder/v2/query` (GraphQL, APQ persisted queries). Three operations:
  - `queryShowMetadataV2` (hash `40202837452991ffa80ced96987bc1a937e21d5a89df5bf1fb743110e4d6e93a`) → `data.podcastUnionV2` metadata.
  - `queryPodcastEpisodes` (hash `06046f9b939d56c8eb7cdbb687da938de1164c006871aec91dc26e4dc7d8eb08`), variables `{uri, offset, limit, includeEpisodeContentRatingsV2:true}` → `data.podcastUnionV2.episodesV2 {items[], totalCount, pagingInfo.nextOffset}`; offset/limit pagination.
  - `internalLinkRecommenderShow` (hash `6c369ff272a666b31fef1629c169925a1bd80f372195396c82304142cacd89e8`), variables `{uri}` → `data.seoRecommendedPodcast`.
- `uri` format: `spotify:show:{id}`.
- Request headers: `authorization: Bearer {token}`, `app-platform: WebPlayer`, `spotify-app-version`, `content-type: application/json;charset=UTF-8`.
- Token: fresh `accessToken` from the page's own `GET /api/token?reason=init&productType=web-player&totp=...` response (captured via `page.on('response')`), or the `authorization` header of any pathfinder request (strip `Bearer ` prefix).
- Episode list item: `items[].entity = {_uri, data, uid}`; `data.__typename` is `Episode` (full fields) or `RestrictedContent` (placeholder — skip it). Fields: `id, name, description, releaseDate.isoString, duration.totalMilliseconds, contentRatingsV2.labels, mediaTypes[], previewPlayback.audioPreview.cdnUrl, coverArt.sources, podcastV2.data` (parent show).
- DOM fallback: title/publisher/rating/description/category are rendered in the body; `h1` is the sidebar "音乐库" not the show title.

## Environment Dependencies

- Runtime: `browser` (daemon connectOverCDP to the user's Chrome/Edge). Public shows need no login; if the browser is logged in, the same flow works.
- The GraphQL endpoint is NOT anonymously callable from node (401 Missing token; the token endpoints are 400/403 from node). Browser page context is required to obtain a valid token.
- Token is short-lived (~30 min): always acquire fresh per execution; never persist.
- Polite pacing: keep 200-700ms random sleeps between pathfinder calls; single execution target ≤10s.

## Failure Signals

- `401 {"error":{"status":401,"message":"Missing/invalid/expired access token"}}` — expired/malformed token (e.g. double `Bearer ` prefix). Fix: acquire fresh token; strip `Bearer ` before re-prefixing.
- `data.podcastUnionV2` absent with `errors` containing "not found" — the show id does not exist → NOT_FOUND.
- First episode list item `data.__typename === "RestrictedContent"` — skip it (placeholder for the featured episode; only `_uri` is present).
- `pagingInfo.nextOffset === null` or empty `items` — episode list exhausted → stop pagination, mark `partial`.
- `h1` returning "音乐库" — expected; the show title is not in `h1` (use GraphQL metadata).
- Pathfinder request body shape changes (variables renamed, new required fields) → DRIFT_DETECTED / field-level errors (GraphQL returns 200 with an `errors` array, not a hard 4xx).

## Repair Clues

- If the APQ hashes stop working (server no longer has the persisted query cached), fall back to sending the full query text (currently not embedded; the hashes were verified working).
- If `queryShowMetadataV2`/`queryPodcastEpisodes` field shapes change, re-run the probe in `a prior explore workspace` to recapture the response structure and update `pickEpisode`/metadata extraction.
- If token capture fails, verify the page still calls `/api/token` on load; alternatively capture the `authorization` header from any pathfinder request.
- DOM fallback covers metadata-only when GraphQL is unreachable; it is a best-effort safety net, not the primary path.
