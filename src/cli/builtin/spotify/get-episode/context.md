# Context

## Precipitation Background (Why This Command Exists)

Spotify is a major podcast platform; the episode (单集) is the consumption unit, and its detail page carries the full description, publish date, duration, explicit/video flags and — uniquely — a 30-second mp3 preview URL. This command fills the detail gap left by list-style commands (`spotify/search`, `spotify/get-podcast`, `spotify/list-new-releases`), which only return episode cards. Explore verified on 2026-08-20 that all of Spotify's data flows through the pathfinder GraphQL endpoint, which is not anonymously callable, hence the browser runtime.

## Value Assessment

- Reuse frequency: high — every episode card from search/show/new-releases can be expanded with `get-episode` for a full detail view including the preview URL.
- Generality: one parameter shape (url or id) + one optional flag; output is a flat, stable schema.
- Time saved: avoids manually opening each episode page, waiting for hydration, and scraping the GraphQL payload.
- Distinct value vs `spotify/get-podcast`: single episode detail + preview URL + per-episode recommendations, not a show's episode list.

## Page Structure

- Target page: `https://open.spotify.com/episode/{id}`.
- Data endpoint: `https://api-partner.spotify.com/pathfinder/v2/query` (POST, fired by the page in context). Match on response `data` keys:
  - `data.episodeUnionV2` — episode metadata (operation `getEpisodeOrChapter`).
  - `data.seoRecommendedEpisode` — "More like this" shelf (`{ items: [{ data: Episode }], totalCount }`).
- Key fields: `name`, `uri`, `description`, `htmlDescription`, `duration.totalMilliseconds`, `releaseDate.isoString`, `contentRatingsV2.labels` (["EXPLICIT"]), `mediaTypes` (["VIDEO","AUDIO"]), `coverArt.sources` (64/300/640), `podcastV2.data` (show name + uri), `previewPlayback.audioPreview.cdnUrl` (30s mp3 preview).
- DOM fallback: `main` region h1 (title), `a[href*="/show/"]` (show link), localized date text (`2026年8月14日` / `Aug 14, 2026`), duration text (`2小时30分` / `2 hr 30 min`), longest text block in `main` (description). Caution: global `h1` may hit the sidebar "音乐库" heading — scope to `main`.

## Environment Dependencies

- Requires a user Chrome/Edge running with remote debugging enabled and consented (daemon connects via CDP; `BROWSER_ATTACH_REQUIRED` if not attached).
- No login needed for public episodes (`authRequired: not-required`).
- Polite pacing: the command sleeps 200-700ms between page polls to avoid hammering Spotify; it reads the page's own single navigation, no high-frequency requests.
- GraphQL field-level errors: trimmed fields / invalid variables may yield field-level `errors` rather than a whole-package rejection — validate per-field.

## Failure Signals

- `capture.episode` never arrives and DOM has no title → `DRIFT_DETECTED` (structure changed).
- `episodeUnionV2.__typename === "NotFound"` or a not-found DOM state → `NOT_FOUND` (bad id / removed episode).
- Related shelf (`seoRecommendedEpisode`) does not fire for some episodes → `partial: true`, empty `related`.
- `page.goto` throws → `NAVIGATION_FAILED`.
- Anonymous curl/node to pathfinder → 401 (expected; this is why the command is browser runtime).

## Repair Clues

- If the `data` key changes (e.g. `episodeUnionV2` renamed), update the response matcher in the `page.on("response")` handler; operation names may change independently of response keys.
- If `previewPlayback.audioPreview.cdnUrl` disappears, fall back to `audio.items[0].url` (segmented preview URLs — reachable in-browser, though they 404 to anonymous curl).
- If `seoRecommendedEpisode` is replaced, the "More like this" shelf may be served by a differently-named query; the DOM shelf ("更多同类单集") is the visual reference for the correct data.
- DOM selectors are heuristic; when they drift, prefer re-confirming the GraphQL path (primary) rather than over-fitting the DOM fallback.
